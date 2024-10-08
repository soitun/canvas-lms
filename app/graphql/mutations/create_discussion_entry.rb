# frozen_string_literal: true

#
# Copyright (C) 2021 - present Instructure, Inc.
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
#

class Mutations::CreateDiscussionEntry < Mutations::BaseMutation
  graphql_name "CreateDiscussionEntry"

  argument :discussion_topic_id, ID, required: true, prepare: GraphQLHelpers.relay_or_legacy_id_prepare_func("DiscussionTopic")
  argument :file_id, ID, required: false, prepare: GraphQLHelpers.relay_or_legacy_id_prepare_func("Attachment")
  argument :message, String, required: true
  argument :parent_entry_id, ID, required: false, prepare: GraphQLHelpers.relay_or_legacy_id_prepare_func("DiscussionEntry")

  argument :is_anonymous_author, Boolean, required: false
  argument :quoted_entry_id, ID, required: false, prepare: GraphQLHelpers.relay_or_legacy_id_prepare_func("DiscussionEntry")

  field :discussion_entry, Types::DiscussionEntryType, null: true
  field :my_sub_assignment_submissions, [Types::SubmissionType], null: true
  def resolve(input:)
    topic = DiscussionTopic.find(input[:discussion_topic_id])
    raise ActiveRecord::RecordNotFound unless topic.grants_right?(current_user, session, :read)

    # if the user is writing a threaded reply when the allow threaded replies feature is disabled
    if !topic.threaded? && !input[:parent_entry_id].nil?
      return validation_error(I18n.t("Threaded replies are not allowed in this context"))
    end

    association = topic.discussion_entries
    entry = build_entry(association, input[:message], topic, !!input[:is_anonymous_author])

    if input[:parent_entry_id]
      parent_entry = topic.discussion_entries.find(input[:parent_entry_id])
      entry.parent_entry = parent_entry
    end

    if input[:quoted_entry_id] && DiscussionEntry.find(input[:quoted_entry_id])
      entry.quoted_entry_id = input[:quoted_entry_id]
    end

    if input[:file_id]
      attachment = Attachment.find(input[:file_id])
      raise ActiveRecord::RecordNotFound unless attachment.user == current_user

      topic_context = topic.context
      unless topic.grants_right?(current_user, session, :attach) ||
             (topic_context.respond_to?(:allow_student_forum_attachments) &&
               topic_context.allow_student_forum_attachments &&
               topic_context.grants_right?(current_user, session, :post_to_forum) &&
               topic.available_for?(current_user)
             )

        return validation_error(I18n.t("Insufficient attach permissions"))
      end

      entry.attachment = attachment
    end

    entry.save!
    entry.delete_draft

    obj = { discussion_entry: entry, my_sub_assignment_submissions: [] }

    if has_sub_assignment_submissions?(current_user, topic)
      checkpoint_submissions = topic.assignment&.sub_assignment_submissions&.active&.where(user_id: current_user)
      obj[:my_sub_assignment_submissions] = checkpoint_submissions
    end

    obj
  rescue ActiveRecord::RecordNotFound
    raise GraphQL::ExecutionError, "not found"
  rescue InsufficientPermissionsError
    validation_error(I18n.t("Insufficient Permissions"))
  end

  def build_entry(association, message, topic, is_anonymous_author)
    message = Api::Html::Content.process_incoming(message, host: context[:request].host, port: context[:request].port)
    entry = association.build(message:, user: current_user, discussion_topic: topic, is_anonymous_author:)
    raise InsufficientPermissionsError unless entry.grants_right?(current_user, session, :create)

    entry
  end

  def has_sub_assignment_submissions?(current_user, topic)
    # if group discussion context is not a course, then there will be no assignment nor submissions
    return false if topic.context.is_a?(Group) && !topic.context.context.is_a?(Course)

    course_id = topic.context.is_a?(Course) ? topic.context.id : topic.context.context.id

    # for graded group discussions, .assignment for the root topic and for each child topic is the same
    # assignment
    topic.assignment&.reload&.has_sub_assignments? && current_user.student_enrollments.where(course_id:).exists?
  end

  class InsufficientPermissionsError < StandardError; end
end
