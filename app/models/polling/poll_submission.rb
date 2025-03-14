# frozen_string_literal: true

#
# Copyright (C) 2011 - present Instructure, Inc.
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

module Polling
  class PollSubmission < ActiveRecord::Base
    belongs_to :poll, class_name: "Polling::Poll"
    belongs_to :poll_choice, class_name: "Polling::PollChoice"
    belongs_to :poll_session, class_name: "Polling::PollSession"
    belongs_to :user

    validates :poll, :poll_choice, :poll_session, :user, presence: true
    validates :user_id,
              uniqueness: { scope: :poll_session_id,
                            message: lambda do |_object, _data|
                                       t(
                                         "polling.poll_submissions.validations.user_and_poll_session_uniqueness",
                                         "can only submit one choice per poll session."
                                       )
                                     end }

    validate :poll_choices_belong_to_poll
    validate :poll_is_published

    set_policy do
      given do |user, session|
        poll.grants_right?(user, session, :update) || self.user == user
      end
      can :read

      given do |user, session|
        poll_session.grants_right?(user, session, :submit)
      end
      can :submit
    end

    private

    def poll_is_published
      if poll_session && !poll_session.is_published?
        errors.add(:base, I18n.t("polling.poll_submissions.validations.poll_is_published",
                                 "This poll session is not open for submissions."))
      end
    end

    def poll_choices_belong_to_poll
      if poll && !poll.poll_choices.include?(poll_choice)
        errors.add(:base, I18n.t("polling.poll_submissions.validations.poll_choice_belongs_to_poll",
                                 "That poll choice does not belong to the existing poll."))
      end
    end
  end
end
