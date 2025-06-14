# frozen_string_literal: true

#
# Copyright (C) 2014 - present Instructure, Inc.
#
# This file is part of Canvas.
#
# Canvas is free software: you can redistribute it and/or modify it under
# the terms of the GNU Affero General Public License as published by the Free
# Software Foundation, version 3 of the License.
#
# Canvas is distributed in the hope that it will be useful, but WITHOUT ANY
# WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
# A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
# details.
#
# You should have received a copy of the GNU Affero General Public License along
# with this program. If not, see <http://www.gnu.org/licenses/>.

module Importers
  class ContextExternalToolImporter < Importer
    self.item_class = ContextExternalTool

    def self.process_migration(data, migration)
      tools = data["external_tools"] || []
      tools.each do |tool|
        next unless migration.import_object?("context_external_tools", tool["migration_id"]) || migration.import_object?("external_tools", tool["migration_id"])

        begin
          import_from_migration(tool, migration.context, migration)
        rescue
          migration.add_import_warning(t("#migration.external_tool_type", "External Tool"), tool[:title], $!)
        end
      end
      migration.imported_migration_items_by_class(ContextExternalTool).each do |tool|
        if (tool.consumer_key == "fake" || tool.shared_secret == "fake") && !tool.use_1_3?
          migration.add_warning(t("external_tool_attention_needed", 'The security parameters for the external tool "%{tool_name}" may need to be set in Course Settings.', tool_name: tool.name))
        end
      end
    end

    def self.import_from_migration(hash, context, migration, item = nil, persist = true)
      hash = hash.with_indifferent_access
      return nil if hash[:migration_id] && hash[:external_tools_to_import] && !hash[:external_tools_to_import][hash[:migration_id]]

      if !item && migration && (item = check_for_compatible_tool_translation(hash, migration))
        return item
      end

      item ||= ContextExternalTool.where(context_id: context, context_type: context.class.to_s, migration_id: hash[:migration_id]).first if hash[:migration_id]
      item ||= context.context_external_tools.temp_record
      item.mark_as_importing!(migration)

      item.migration_id = hash[:migration_id]
      item.name = hash[:title]
      item.description = hash[:description]
      item.tool_id = hash[:tool_id]
      if hash[:url].present?
        url = hash[:url]
        url = migration.process_domain_substitutions(url) if migration
        item.url = url
      end
      item.domain = hash[:domain]
      item.privacy_level = hash[:privacy_level] || "name_only"
      item.not_selectable = hash[:not_selectable] if hash[:not_selectable]
      item.consumer_key ||= hash[:consumer_key] || "fake"
      item.shared_secret ||= hash[:shared_secret] || "fake"
      item.lti_version = hash[:lti_version] || (hash.dig(:settings, :client_id) && "1.3") || (hash.dig(:settings, :use_1_3) && "1.3") || "1.1"
      item.unified_tool_id = hash[:unified_tool_id] if hash[:unified_tool_id]
      item.settings = create_tool_settings(hash)

      if (developer_key_id = hash.dig(:settings, :client_id)).present?
        item.developer_key_id ||= developer_key_id
        item.lti_registration_id ||= item.developer_key&.lti_registration_id
      end

      Lti::ResourcePlacement::PLACEMENTS.each do |placement|
        next unless item.settings.key?(placement)

        item.set_extension_setting(placement, item.settings[placement])
      end

      if hash[:custom_fields].is_a? Hash
        item.settings[:custom_fields] ||= {}
        item.settings[:custom_fields].merge! hash[:custom_fields]
      end

      return if item.new_record? && ContextExternalTool.where(identity_hash: item.calculate_identity_hash).exists?

      item.save! if persist
      migration&.add_imported_item(item)
      item
    end

    def self.create_tool_settings(hash)
      settings = hash[:settings].is_a?(Hash) ? hash[:settings] : {}
      settings = settings.with_indifferent_access

      ContextExternalTool.normalize_sizes!(settings)

      if hash[:extensions].is_a? Array
        settings[:vendor_extensions] ||= []
        hash[:extensions].each do |ext|
          next unless ext[:custom_fields].is_a? Hash

          if (existing = settings[:vendor_extensions].find { |ve| ve[:platform] == ext[:platform] })
            existing[:custom_fields] ||= {}
            existing[:custom_fields].merge! ext[:custom_fields]
          else
            settings[:vendor_extensions] << { platform: ext[:platform], custom_fields: ext[:custom_fields] }
          end
        end
      end

      if hash[:oidc_initiation_urls].is_a?(Hash)
        settings[:oidc_initiation_urls] = hash[:oidc_initiation_urls]
      end

      settings
    end

    def self.check_for_compatible_tool_translation(hash, migration)
      if migration.migration_settings[:prefer_existing_tools] && (tool = check_for_existing_tool(hash, migration))
        return tool
      end

      if migration.migration_type == "common_cartridge_importer" && (tool = check_for_tool_compaction(hash, migration))
        tool
      end
    end

    def self.check_for_tool_compaction(hash, migration)
      # rather than making a thousand separate tools, try to combine into other tools if we can

      url, domain, settings = extract_for_translation(hash)
      return if url && ContextModuleImporter.add_custom_fields_to_url(url, hash[:custom_fields] || {}).nil?

      return unless url || domain

      migration.imported_migration_items_by_class(ContextExternalTool).each do |tool|
        next unless matching_settings?(migration, hash, tool, settings)

        if tool.url.blank? && tool.domain.present?
          match_domain = tool.domain

          if domain && domain == match_domain # translate the hash url to existing tool
            tool.domain = match_domain
            tool.save! if tool.changed?

            migration.add_external_tool_translation(hash[:migration_id], tool, hash[:custom_fields])
            generalize_tool_name(tool)
            return tool
          end
        elsif tool.url.present?
          begin
            match_domain = URI.parse(tool.url).host
          rescue URI::InvalidURIError
            # ignore
          end

          if domain && match_domain == domain
            # turn the matched tool into a domain only tool
            # and translate both the hash url and the tool's old url

            old_custom_fields = tool.settings[:custom_fields]
            tool.url = nil
            tool.domain = match_domain
            tool.settings[:custom_fields] = {}
            tool.save!

            migration.add_external_tool_translation(tool.migration_id, tool, old_custom_fields)
            migration.add_external_tool_translation(hash[:migration_id], tool, hash[:custom_fields])
            generalize_tool_name(tool)
            return tool
          end
        end
      end

      nil
    end

    def self.check_for_existing_tool(hash, migration)
      url, domain, settings = extract_for_translation(hash)
      return unless domain

      Lti::ContextToolFinder.all_tools_for(migration.context).each do |tool|
        # check if tool is compatible
        next unless matching_settings?(migration, hash, tool, settings, true)

        if tool.url.blank? && tool.domain.present?
          if domain && domain == tool.domain
            migration.add_external_tool_translation(hash[:migration_id], tool, hash[:custom_fields])
            return tool
          end
        elsif tool.url.present?
          if url && url == tool.url
            migration.add_external_tool_translation(hash[:migration_id], tool, hash[:custom_fields])
            return tool
          end
        end
      end
      nil
    end

    def self.extract_for_translation(hash)
      url = hash[:url].presence

      domain = hash[:domain]
      begin
        domain ||= URI.parse(url).host if url
      rescue URI::InvalidURIError
        # ignore
      end

      settings = create_tool_settings(hash).with_indifferent_access.except(:custom_fields, :vendor_extensions)

      [url, domain, settings]
    end

    def self.generalize_tool_name(tool)
      if tool.domain
        tool.name = CanvasTextHelper.truncate_text(tool.domain, max_length: 100)
        tool.description = "A combined configuration for all tools with the domain: #{tool.domain}"
        tool.save! if tool.changed?
      end
    end

    def self.matching_settings?(migration, hash, tool, settings, preexisting_tool = false)
      return false if hash[:privacy_level] && tool.privacy_level != hash[:privacy_level]
      return false if migration.migration_type == "canvas_cartridge_importer" && hash[:title] && tool.name != hash[:title]

      if preexisting_tool && ((hash[:consumer_key] || "fake") == "fake") && ((hash[:shared_secret] || "fake") == "fake")
        # we're matching to existing tools; go with their config if we don't have a real one
        ignore_key_check = true
      end
      return false unless ignore_key_check || (tool.consumer_key == (hash[:consumer_key] || "fake") && tool.shared_secret == (hash[:shared_secret] || "fake"))

      tool_settings = tool.settings.with_indifferent_access.except(:custom_fields, :vendor_extensions)
      if preexisting_tool
        settings.all? { |k, v| tool_settings[k].presence == v.presence }
      else
        settings == tool_settings
      end
    end
  end
end
