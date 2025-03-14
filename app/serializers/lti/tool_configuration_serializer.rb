# frozen_string_literal: true

#
# Copyright (C) 2018 - present Instructure, Inc.
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

module Lti
  class ToolConfigurationSerializer
    include Api::V1::DeveloperKey

    def initialize(tool_configuration, include_warnings: false)
      @tool_configuration = tool_configuration
      @include_warnings = include_warnings
    end

    def as_json
      key = @tool_configuration.developer_key
      json = @tool_configuration.as_json

      json[:developer_key] = developer_key_json(key, nil, nil, key.owner_account)
      json[:tool_configuration][:settings] = @tool_configuration.lti_registration.canvas_configuration(context: key.owner_account)
      json[:warning_message] = @tool_configuration.placement_warnings if @include_warnings
      json
    end
  end
end
