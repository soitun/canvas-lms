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
#

module Types
  class SubmissionSearchOrderFieldInputType < Types::BaseEnum
    graphql_name "SubmissionSearchOrderField"
    description "The user or submission field to sort by"
    # user sorts
    value "group_name"
    value "username"
    value "username_first_last"
    value "test_student"

    # submission sorts
    value "needs_grading"
    value "random"
    value "score"
    value "submission_status"
    value "submitted_at"
  end

  class SubmissionSearchOrderInputType < Types::BaseInputObject
    graphql_name "SubmissionSearchOrder"
    description "Specify a sort for the results. The 'direction' argument is ignored for 'random' sorts. For sorts of boolean fields, 'true' comes before 'false' for ascending sorts."
    argument :direction, OrderDirectionType, required: false
    argument :field, SubmissionSearchOrderFieldInputType, required: true
  end
end
