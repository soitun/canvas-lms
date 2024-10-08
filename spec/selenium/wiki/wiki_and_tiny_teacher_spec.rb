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

require_relative "../helpers/wiki_and_tiny_common"

describe "Wiki pages and Tiny WYSIWYG editor" do
  include_context "in-process server selenium tests"
  include WikiAndTinyCommon

  context "as a teacher" do
    before do
      course_with_teacher_logged_in
    end

    it "shows the correct options in 'Users allowed to edit this page' dropdown" do
      get "/courses/#{@course.id}/pages"
      f(".new_page").click
      expect(f("select[name=\"editing_roles\"]").find_elements(:css, "option").map(&:text)).to eq ["Only teachers", "Teachers and students", "Anyone"]
    end

    ["Only teachers", "Teachers and students", "Anyone"].each_with_index do |permission, i|
      it "validates correct permissions for #{permission}" do
        title = "test_page"
        unpublished = false
        edit_roles = "public"
        validations = ["teachers", "teachers,students", "teachers,students,members"]

        p = create_wiki_page(title, unpublished, edit_roles)
        get "/courses/#{@course.id}/pages/#{p.title}/edit"

        expect(f("form.edit-form .edit-content")).to be_displayed

        click_option("select[name=\"editing_roles\"]", permission)
        # form id is set like this because the id iterator is in the form but im not sure how to grab it directly before committed to the DB with the save
        wait_for_new_page_load(f("form.edit-form button.submit").click)

        p.reload
        expect(p.editing_roles).to eq validations[i]
      end
    end

    it "takes user to page history" do
      title = "test_page"
      unpublished = false
      edit_roles = "public"

      p = create_wiki_page(title, unpublished, edit_roles)
      # sets body
      p.update(body: "test")

      get "/courses/#{@course.id}/pages/#{p.title}"

      wait_for_ajaximations

      f(".page-toolbar .buttons .al-trigger").click
      expect_new_page_load { f(".view_page_history").click }

      expect(ff(".revision").length).to eq 2
    end

    it "loads the previous version of the page and roll-back page" do
      title = "test_page"
      unpublished = false
      edit_roles = "public"
      body = "test"

      p = create_wiki_page(title, unpublished, edit_roles)
      # sets body and then resets it for history verification
      p.update(body:)
      p.update(body: "sample")

      get "/courses/#{@course.id}/pages/#{p.title}/revisions"
      wait_for_ajaximations

      ff(".revision")[1].click
      wait_for_ajaximations

      expect(f(".show-content").text).to include body

      f(".revision .restore-link").click
      f('button[data-testid="confirm-button"]').click

      p.reload
      expect(p.body).to eq body
    end
  end
end
