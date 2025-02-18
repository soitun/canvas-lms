# frozen_string_literal: true

#
# Copyright (C) 2012 - present Instructure, Inc.
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

require_relative "../common"

describe "Sessions Timeout" do
  include_context "in-process server selenium tests"

  describe "Validations" do
    context "when you are logged in as an admin" do
      before do
        user_logged_in
        Account.site_admin.account_users.create!(user: @user)
      end

      xit "requires session expiration to be at least 20 minutes" do
        get "/plugins/sessions"
        unless f("#plugin_setting_disabled").displayed?
          f("#accounts_select option:nth-child(2)").click
          expect(f("#plugin_setting_disabled")).to be_displayed
        end
        unless f(".save_button").enabled?
          f(".copy_settings_button").click
        end
        f("#plugin_setting_disabled").click
        f("#settings_session_timeout").clear
        f("#settings_session_timeout").send_keys("19")
        expect_new_page_load { f(".save_button").click }
        assert_flash_error_message "There was an error saving the plugin settings"
      end
    end
  end

  it "logs the user out after the session is expired" do
    plugin_setting = PluginSetting.new(name: "sessions", settings: { "session_timeout" => "1" })
    plugin_setting.save!
    user_with_pseudonym({ active_user: true })
    login_as
    expect(f('[aria-label="Profile tray"] h2').text).to eq @user.pseudonyms.first.unique_id

    Timecop.travel(61.seconds.from_now) do
      get "/courses"

      assert_flash_warning_message("You must be logged in to access this page")
    end
  end
end
