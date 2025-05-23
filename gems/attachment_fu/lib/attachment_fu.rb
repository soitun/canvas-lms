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

require "attachment_fu/railtie"
require "attachment_fu/processors/mini_magick_processor"
require "attachment_fu/backends/file_system_backend"
require "attachment_fu/backends/s3_backend"

module AttachmentFu # :nodoc:
  @@default_processors = %w[MiniMagick]
  # Instructure: I (ryan shaw) just copied and pasted this from http://github.com/technoweenie/attachment_fu/blob/master/lib/technoweenie/attachment_fu.rb
  @@content_types      = [
    "image/jpeg",
    "image/pjpeg",
    "image/jpg",
    "image/gif",
    "image/png",
    "image/x-png",
    "image/jpg",
    "image/x-ms-bmp",
    "image/bmp",
    "image/x-bmp",
    "image/webp",
    "image/x-bitmap",
    "image/x-xbitmap",
    "image/x-win-bitmap",
    "image/x-windows-bmp",
    "image/ms-bmp",
    "application/bmp",
    "application/x-bmp",
    "application/x-win-bitmap",
    "application/preview",
    "image/jp_",
    "application/jpg",
    "application/x-jpg",
    "image/pipeg",
    "image/vnd.swiftview-jpeg",
    "image/x-xbitmap",
    "application/png",
    "application/x-png",
    "image/gi_",
    "image/x-citrix-pjpeg"
  ]
  mattr_reader :content_types, :tempfile_path, :default_processors
  mattr_writer :tempfile_path

  class ThumbnailError < StandardError;  end

  class AttachmentError < StandardError; end

  module ActMethods
    # Options:
    # *  <tt>:content_type</tt> - Allowed content types.  Allows all by default.  Use :image to allow all standard image types.
    # *  <tt>:min_size</tt> - Minimum size allowed.  1 byte is the default.
    # *  <tt>:max_size</tt> - Maximum size allowed.  1.megabyte is the default.
    # *  <tt>:size</tt> - Range of sizes allowed.  (1..1.megabyte) is the default.  This overrides the :min_size and :max_size options.
    # *  <tt>:resize_to</tt> - Used by RMagick to resize images.  Pass either an array of width/height, or a geometry string.
    # *  <tt>:thumbnails</tt> - Specifies a set of thumbnails to generate.  This accepts a hash of filename suffixes and RMagick resizing options.
    # *  <tt>:thumbnail_class</tt> - Set what class to use for thumbnails.  This attachment class is used by default.
    # *  <tt>:path_prefix</tt> - path to store the uploaded files.  Uses public/#{table_name} by default for the filesystem, and just #{table_name}
    #      for the S3 backend.  Setting this sets the :storage to :file_system.
    # *  <tt>:storage</tt> - Use :file_system to specify the attachment data is stored with the file system.  Defaults to :db_system.

    # *  <tt>:keep_profile</tt> By default image EXIF data will be stripped to minimize image size. For small thumbnails this proivides important savings. Picture quality is not affected. Set to false if you want to keep the image profile as is. ImageScience will allways keep EXIF data.
    #
    # Examples:
    #   has_attachment :max_size => 1.kilobyte
    #   has_attachment :size => 1.megabyte..2.megabytes
    #   has_attachment :content_type => 'application/pdf'
    #   has_attachment :content_type => ['application/pdf', 'application/msword', 'text/plain']
    #   has_attachment :content_type => :image, :resize_to => [50,50]
    #   has_attachment :content_type => ['application/pdf', :image], :resize_to => 'x50'
    #   has_attachment :thumbnails => { :thumb => [50, 50], :geometry => 'x50' }
    #   has_attachment :storage => :file_system, :path_prefix => 'public/files'
    #   has_attachment :storage => :file_system, :path_prefix => 'public/files',
    #     :content_type => :image, :resize_to => [50,50]
    #   has_attachment :storage => :file_system, :path_prefix => 'public/files',
    #     :thumbnails => { :thumb => [50, 50], :geometry => 'x50' }
    #   has_attachment :storage => :s3
    def has_attachment(options = {})
      # this allows you to redefine the acts' options for each subclass, however
      options[:min_size]         ||= 1
      options[:max_size]         ||= 1.megabyte
      options[:size]             ||= (options[:min_size]..options[:max_size])
      options[:thumbnails]       ||= {}
      options[:thumbnail_class]  ||= self
      options[:s3_access]        ||= "public-read"
      options[:content_type] = [options[:content_type]].flatten.collect! { |t| (t == :image) ? AttachmentFu.content_types : t }.flatten unless options[:content_type].nil?

      unless options[:thumbnails].is_a?(Hash)
        raise ArgumentError, ":thumbnails option should be a hash: e.g. :thumbnails => { :foo => '50x50' }"
      end

      extend ClassMethods unless (class << self; included_modules; end).include?(ClassMethods)
      include InstanceMethods unless included_modules.include?(InstanceMethods)

      parent_options = attachment_options || {}
      # doing these shenanigans so that #attachment_options is available to processors and backends
      self.attachment_options = options

      attr_accessor :thumbnail_resize_options

      attachment_options[:storage]     ||= (attachment_options[:file_system_path] || attachment_options[:path_prefix]) ? :file_system : :db_file
      attachment_options[:storage]     ||= parent_options[:storage]
      attachment_options[:path_prefix] ||= attachment_options[:file_system_path]
      if attachment_options[:path_prefix].nil?
        attachment_options[:path_prefix] = (attachment_options[:storage] == :s3) ? table_name : File.join("public", table_name)
      end
      attachment_options[:path_prefix] = attachment_options[:path_prefix][1..] if options[:path_prefix].first == "/"

      with_options foreign_key: "parent_id" do |m|
        m.has_many   :thumbnails, class_name: "::#{attachment_options[:thumbnail_class]}"
        m.belongs_to :parent, class_name: "::#{base_class}" unless options[:thumbnails].empty?
      end

      storage_mod = AttachmentFu::Backends.const_get(:"#{options[:storage].to_s.classify}Backend")
      include storage_mod unless included_modules.include?(storage_mod)

      unless parent_options[:processor]
        case attachment_options[:processor]
        when :none, nil
          processors = AttachmentFu.default_processors.dup
          begin
            if processors.any?
              attachment_options[:processor] = "#{processors.first}Processor"
              processor_mod = AttachmentFu::Processors.const_get(attachment_options[:processor])
              prepend processor_mod unless included_modules.include?(processor_mod)
            end
          rescue Object
            raise unless load_related_exception?($!)

            processors.shift
            retry
          end
        else
          begin
            processor_mod = AttachmentFu::Processors.const_get(:"#{attachment_options[:processor].to_s.classify}Processor")
            include processor_mod unless included_modules.include?(processor_mod)
          rescue Object
            raise unless load_related_exception?($!)

            puts "Problems loading #{options[:processor]}Processor: #{$!}"
          end
        end
      end # Don't let child override processor
    end

    def load_related_exception?(e) # :nodoc: implementation specific
      # We can't rescue CompilationError directly, as it is part of the RubyInline library.
      # We must instead rescue RuntimeError, and check the class' name.
      e.is_a?(LoadError) || e.is_a?(MissingSourceFile) || e.instance_of?(CompilationError)
    end
    private :load_related_exception?
  end

  module ClassMethods
    delegate :content_types, to: AttachmentFu

    # Performs common validations for attachment models.
    def validates_as_attachment
      validates_presence_of :size, :content_type, :filename
      validate              :attachment_attributes_valid?
    end

    # Returns true or false if the given content type is recognized as an image.
    def image?(content_type)
      content_types.include?(content_type)
    end

    def self.extended(base)
      base.class_attribute :attachment_options, instance_reader: false, instance_writer: false
      base.before_destroy :destroy_thumbnails
      base.before_validation :set_size_from_temp_path
      base.after_save :after_process_attachment
      base.after_destroy :destroy_file
      base.after_validation :process_attachment
      base.define_model_callbacks :save_and_attachment_processing, only: [:after]
    end

    # Get the thumbnail class, which is the current attachment class by default.
    # Configure this with the :thumbnail_class option.
    def thumbnail_class
      attachment_options[:thumbnail_class] = attachment_options[:thumbnail_class].constantize unless attachment_options[:thumbnail_class].is_a?(Class)
      attachment_options[:thumbnail_class]
    end

    # Copies the given file path to a new tempfile, returning the closed tempfile.
    def copy_to_temp_file(file, temp_base_name)
      Tempfile.new(["", temp_base_name], AttachmentFu.tempfile_path).tap do |tmp|
        tmp.close
        FileUtils.cp file, tmp.path
      end
    end

    # Writes the given data to a new tempfile, returning the closed tempfile.
    def write_to_temp_file(data, temp_base_name)
      Tempfile.new(["", temp_base_name], AttachmentFu.tempfile_path).tap do |tmp|
        tmp.binmode
        tmp.write data
        tmp.close
      end
    end
  end

  module InstanceMethods
    require "rack"

    def attachment_options
      @attachment_options || self.class.attachment_options
    end

    def attachment_options=(value)
      @attachment_options = self.class.attachment_options.merge(value)
    end

    # Checks whether the attachment's content type is an image content type
    def image?
      self.class.image?(content_type)
    end

    # Returns true/false if an attachment is thumbnailable.  A thumbnailable attachment has an image content type and the parent_id attribute.
    def thumbnailable?
      image? && respond_to?(:parent_id) && parent_id.nil?
    end

    # Returns the class used to create new thumbnails for this attachment.
    delegate :thumbnail_class, to: :class

    # Gets the thumbnail name for a filename.  'foo.jpg' becomes 'foo_thumbnail.jpg'
    def thumbnail_name_for(thumbnail = nil)
      return filename if thumbnail.blank?

      ext = nil
      basename = filename.gsub(/\.\w+$/) do |s|
        ext = s
        ""
      end
      # ImageScience doesn't create gif thumbnails, only pngs
      ext.sub!(/gif$/, "png") if attachment_options[:processor] == "ImageScience"
      name = "#{basename}_#{thumbnail}#{ext}"
      if name.length > 255
        name = "#{basename[0..(254 - name.length)]}_#{thumbnail}#{ext}"
      end
      name
    end

    # Creates or updates the thumbnail for the current attachment.
    def create_or_update_thumbnail(temp_file, file_name_suffix, *size)
      thumbnailable? || raise(ThumbnailError, "Can't create a thumbnail if the content type is not an image or there is no parent_id column")
      find_or_initialize_thumbnail(file_name_suffix).tap do |thumb|
        thumb.attributes = {
          content_type:,
          filename: thumbnail_name_for(file_name_suffix),
          temp_path: temp_file,
          thumbnail_resize_options: size
        }
        if thumb.valid?
          thumb.process_attachment
          thumb.save!
        end
      end
    end

    def create_thumbnail_size(target_size)
      actual_size = attachment_options[:thumbnails][target_size]
      raise "this class doesn't have a thubnail size for #{target_size}" if actual_size.nil?

      begin
        tmp = create_temp_file
        res = create_or_update_thumbnail(tmp, target_size.to_s, actual_size)
      rescue Aws::S3::Errors::NoSuchKey => e
        logger.warn("error when trying to make thumbnail for attachment_id: #{id} (the image probably doesn't exist on s3) error details: #{e.inspect}")
      rescue ThumbnailError => e
        logger.warn("error creating thumbnail for attachment_id #{id}: #{e.inspect}")
      ensure
        tmp&.unlink
      end

      res
    end

    # Sets the content type.
    def content_type=(new_type)
      super(new_type.to_s.strip)
    end

    # Sanitizes a filename.
    def filename=(new_name)
      super(sanitize_filename(new_name))
    end

    # Returns the width/height in a suitable format for the image_tag helper: (100x100)
    def image_size
      [width.to_s, height.to_s].join("x")
    end

    # Returns true if the attachment data will be written to the storage system on the next save
    # This only works if temp_path is set by something else, which happens in the local file
    # system and with s3 files when creating an image thumbnail (but not with regular s3 file uploads
    # or instfs uploads of any kind)
    def save_attachment_from_temp_path?
      if is_a?(Attachment)
        if root_attachment_id && new_record?
          return false
        end

        filename && File.file?(temp_path.to_s)
      else
        File.file?(temp_path.to_s)
      end
    end

    # nil placeholder in case this field is used in a form.
    def uploaded_data
      nil
    end

    # This method handles the uploaded file object.  If you set the field name to uploaded_data, you don't need
    # any special code in your controller.
    #
    #   <% form_for :attachment, :html => { :multipart => true } do |f| -%>
    #     <p><%= f.file_field :uploaded_data %></p>
    #     <p><%= submit_tag :Save %>
    #   <% end -%>
    #
    #   @attachment = Attachment.create! params[:attachment]
    #
    # TODO: Allow it to work with Merb tempfiles too.
    def uploaded_data=(file_data)
      return if file_data.blank?

      if is_a?(Attachment)
        # glean information from the file handle
        self.content_type = File.mime_types.include?(content_type) ? content_type : detect_mimetype(file_data)
        self.filename = file_data.original_filename if respond_to?(:filename) && file_data.respond_to?(:original_filename)
        file_from_path = true
        if file_data.respond_to?(:path) && file_data.path.present?
          temp_paths.unshift file_data
        else
          file_data.rewind
          self.temp_data = file_data.read
          file_from_path = false
        end
        # If we're overwriting an existing file, we need to take serious
        # precautions, since other Attachment records could be using this file.
        # We first remove any root references for this file, and then we generate
        # a new unique filename for this file so any children of this attachment
        # will still be able to get at the original.
        unless new_record?
          # if the file doesn't have a filename for some reason, it often pulls from the root attachment
          # but if you remove the root attachment, you lose the filename, so we're saving it first
          orig_filename = filename
          self.root_attachment = nil
          self.root_attachment_id = nil
          self.workflow_state = nil
          self.filename = orig_filename.sub(/\A\d+_\d+__/, "")
          self.filename = "#{Time.now.to_i}_#{rand(999)}__#{filename}" if filename
        end
        unless attachment_options[:skip_sis]
          read_bytes = false
          digest = Digest::MD5.new
          begin
            io = file_data
            if file_from_path
              io = File.open(temp_path, "rb")
            end
            io.rewind
            io.each_line do |line|
              digest.update(line)
              read_bytes = true
            end
          rescue
            nil
          ensure
            io.close if file_from_path
          end
        end
        self.md5 = read_bytes ? digest.hexdigest : nil
        if (existing_attachment = find_existing_attachment_for_md5)
          self.temp_path = nil if respond_to?(:temp_path=)
          self.temp_data = nil if respond_to?(:temp_data=)
          self.filename = nil if respond_to?(:filename=)
          self.root_attachment = existing_attachment
        end
        file_data
      else
        self.content_type = file_data.content_type
        self.filename     = file_data.original_filename if respond_to?(:filename)
        if file_data.respond_to?(:path)
          self.temp_path = file_data
        else
          file_data.rewind
          self.temp_data = file_data.read
        end
      end
    end

    def find_existing_attachment_for_md5
      return nil if avoid_linking_to_root_attachment

      shard.activate do
        GuardRail.activate(:secondary) do
          if md5.present? && (ns = infer_namespace)
            scope = Attachment.where(md5:, namespace: ns, root_attachment_id: nil, content_type:, instfs_uuid: nil)
            scope = scope.where.not(filename: nil).where.not(workflow_state: "pending_upload")
            scope = scope.where.not(id: self) unless new_record?
            scope.detect { |a| a.store.exists? }
          end
        end
      end
    end

    def detect_mimetype(file_data)
      if file_data.respond_to?(:content_type) && (file_data.content_type.blank? || file_data.content_type.strip == "application/octet-stream")
        res = nil
        res ||= File.mime_type(file_data.original_filename) if file_data.respond_to?(:original_filename)
        res ||= File.mime_type(file_data)
        res ||= "text/plain" unless file_data.respond_to?(:path)
        res || "unknown/unknown"
      elsif file_data.respond_to?(:content_type)
        file_data.content_type
      else
        File.mime_type(file_data)
      end
    end

    # Gets the latest temp path from the collection of temp paths.  While working with an attachment,
    # multiple Tempfile objects may be created for various processing purposes (resizing, for example).
    # An array of all the tempfile objects is stored so that the Tempfile instance is held on to until
    # it's not needed anymore.  The collection is cleared after saving the attachment.
    def temp_path
      p = temp_paths.first
      p.respond_to?(:path) ? p.path : p.to_s
    end

    # Gets an array of the currently used temp paths.  Defaults to a copy of #full_filename.
    def temp_paths
      # INSTRUCTURE: was "@temp_paths ||= (new_record? || !respond_to?(:full_filename) || !File.exist?(full_filename) ?"
      @temp_paths ||= if new_record? || !respond_to?(:full_filename) || !full_filename || !File.exist?(full_filename)
                        []
                      else
                        [copy_to_temp_file(full_filename)]
                      end
    end

    # Adds a new temp_path to the array.  This should take a string or a Tempfile.  This class makes no
    # attempt to remove the files, so Tempfiles should be used.  Tempfiles remove themselves when they go out of scope.
    # You can also use string paths for temporary files, such as those used for uploaded files in a web server.
    def temp_path=(value)
      temp_paths.unshift value
      temp_path
    end

    # Gets the data from the latest temp file.  This will read the file into memory.
    def temp_data
      save_attachment_from_temp_path? ? File.read(temp_path) : nil
    end

    # Writes the given data to a Tempfile and adds it to the collection of temp files.
    def temp_data=(data)
      self.temp_path = write_to_temp_file data unless data.nil?
    end

    # Copies the given file to a randomly named Tempfile.
    def copy_to_temp_file(file)
      self.class.copy_to_temp_file file, random_tempfile_filename
    end

    # Writes the given file to a randomly named Tempfile.
    def write_to_temp_file(data)
      self.class.write_to_temp_file data, random_tempfile_filename
    end

    # Stub for creating a temp file from the attachment data.  This should be defined in the backend module.
    def create_temp_file() end

    # Allows you to work with a processed representation (RMagick, ImageScience, etc) of the attachment in a block.
    #
    #   @attachment.with_image do |img|
    #     self.data = img.thumbnail(100, 100).to_blob
    #   end
    #
    def with_image(&)
      self.class.with_image(temp_path, &)
    end

    protected

    # Generates a unique filename for a Tempfile.
    def random_tempfile_filename
      "#{rand Time.now.to_i}#{filename&.last(50) || "attachment"}"
    end

    def sanitize_filename(filename)
      filename.strip.tap do |name|
        # NOTE: File.basename doesn't work right with Windows paths on Unix
        # get only the filename, not the whole path
        name.gsub!(%r{^.*(\\|/)}, "")

        # Finally, replace all non alphanumeric, underscore or periods with underscore
        name.gsub!(/[^\w.-]/, "_")
      end
    end

    # before_validation callback.
    def set_size_from_temp_path
      self.size = File.size(temp_path) if save_attachment_from_temp_path?
    end

    # validates the size and content_type attributes according to the current model's options
    def attachment_attributes_valid?
      [:size, :content_type].each do |attr_name|
        enum = attachment_options[attr_name]
        errors.add attr_name, ActiveRecord::Errors.default_error_messages[:inclusion] unless enum.nil? || enum.include?(send(attr_name))
      end
    end

    # Initializes a new thumbnail with the given suffix.
    def find_or_initialize_thumbnail(file_name_suffix)
      scope = thumbnail_class.where(thumbnail: file_name_suffix.to_s)
      scope = scope.where(parent_id: id) if respond_to?(:parent_id)
      scope.first_or_initialize
    end

    # Stub for a #process_attachment method in a processor
    def process_attachment
      @saved_attachment = save_attachment_from_temp_path?
      run_before_attachment_saved if @saved_attachment && respond_to?(:run_before_attachment_saved)
      @saved_attachment
    end

    # Cleans up after processing.  Thumbnails are created, the attachment is stored to the backend, and the temp_paths are cleared.
    def after_process_attachment
      if @saved_attachment
        # # INSTRUCTURE I (ryan shaw) commented these next lines out so that the thumbnailing does not happen syncronisly as part of the request.
        # # we are going to do the same thing as delayed_jobs
        # if respond_to?(:process_attachment) && thumbnailable? && !attachment_options[:thumbnails].blank? && parent_id.nil?
        #   temp_file = temp_path || create_temp_file
        #   attachment_options[:thumbnails].each { |suffix, size| create_or_update_thumbnail(temp_file, suffix, *size) }
        # end

        # In normal attachment upload usage, the only transaction we should
        # be inside is the AR#save transaction. If that's the case, defer
        # the upload and callbacks until after the transaction commits. If
        # the upload fails, that will leave this attachment in an
        # unattached state, but that's already the case in other error
        # situations as well.
        #
        # If there is no transaction, or more than one transaction, then
        # just upload immediately. This can happen if
        # after_process_attachment is called directly, or if we're inside
        # an rspec test run (which is wrapped in an outer transaction).
        # It can also happen if somebody explicitly uploads file data
        # inside a .transaction block, which we normally shouldn't do.
        save_and_callbacks = proc do
          save_to_storage
          @temp_paths.clear
          @saved_attachment = nil
          run_after_attachment_saved if respond_to?(:run_after_attachment_saved)
          run_callbacks(:save_and_attachment_processing)
        end

        if Rails.env.test?
          save_and_callbacks.call
        else
          self.class.connection.after_transaction_commit(&save_and_callbacks)
        end
      else
        run_callbacks(:save_and_attachment_processing)
      end
    end

    # Resizes the given processed img object with either the attachment resize options or the thumbnail resize options.
    def resize_image_or_thumbnail!(img)
      if (!respond_to?(:parent_id) || parent_id.nil?) && attachment_options[:resize_to] # parent image
        resize_image(img, attachment_options[:resize_to])
      elsif thumbnail_resize_options # thumbnail
        resize_image(img, thumbnail_resize_options)
      end
    end

    # Removes the thumbnails for the attachment, if it has any
    def destroy_thumbnails
      thumbnails.each(&:destroy) if thumbnailable?
    end
  end
end

# backwards-compatible shim
module Technoweenie
  AttachmentFu = ::AttachmentFu
end
