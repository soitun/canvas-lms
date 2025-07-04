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

# @API Developer Key Account Bindings
# Developer key account bindings API for binding a developer key to a context and
# specifying a workflow state for that relationship.
#
# @model DeveloperKeyAccountBinding
#     {
#       "id": "DeveloperKeyAccountBinding",
#       "description": "",
#       "properties": {
#          "id": {
#            "description": "The Canvas ID of the binding",
#            "example": "1",
#            "type": "number"
#          },
#          "account_id": {
#            "description": "The global Canvas ID of the account in the binding",
#            "example": "10000000000001",
#            "type": "number"
#          },
#          "developer_key_id": {
#            "description": "The global Canvas ID of the developer key in the binding",
#            "example": "10000000000008",
#            "type": "number"
#          },
#          "workflow_state": {
#            "description": "The workflow state of the binding. Will be one of 'on', 'off', or 'allow.'",
#            "example": "on",
#            "type": "number"
#          },
#          "account_owns_binding": {
#            "description": "True if the requested context owns the binding",
#            "example": "true",
#            "type": "boolean"
#          }
#       }
#     }
class DeveloperKeyAccountBindingsController < ApplicationController
  before_action :require_context
  before_action :require_manage_developer_keys
  before_action :developer_key_in_account, only: :create_or_update
  before_action :require_root_account
  before_action :restrict_federated_child_accounts

  # @API Create a Developer Key Account Binding
  # Create a new Developer Key Account Binding. The developer key specified
  # in the request URL must be available in the requested account or the
  # requested account's account chain. If the binding already exists for the
  # specified account/key combination it will be updated.
  #
  # @argument workflow_state [String]
  #   The workflow state for the binding. Must be one of "on", "off", or "allow".
  #   Defaults to "off".
  #
  # @returns DeveloperKeyAccountBinding
  def create_or_update
    # To simplify use of this internal API we allow creating or updating via
    # this endpoint.
    binding = nil
    if lti_registration.present?
      Lti::AccountBindingService.call(account:,
                                      user: @current_user,
                                      registration: lti_registration,
                                      workflow_state: workflow_state_param[:workflow_state]) => { developer_key_account_binding: binding }
    else
      binding = existing_binding || DeveloperKeyAccountBinding.new(create_params)
      binding.assign_attributes workflow_state_param
      binding.save!
    end

    render json: DeveloperKeyAccountBindingSerializer.new(binding, @context),
           status: binding.previously_new_record? ? :ok : :created
  end

  private

  def existing_binding
    @_existing_binding ||= account.developer_key_account_bindings.find_by(
      developer_key_id: params[:developer_key_id]
    )
  end

  def create_params
    workflow_state_param.merge(
      {
        account:,
        developer_key:
      }
    )
  end

  def workflow_state_param
    params.require(:developer_key_account_binding).permit(
      :workflow_state
    )
  end

  def account
    @_account ||= api_find(Account, params[:account_id])
  end

  def lti_registration
    @_registration ||= developer_key.lti_registration
  end

  def developer_key
    @_developer_key ||= DeveloperKey.find_cached(params[:developer_key_id])
  end

  def developer_key_in_account
    # Get all account ids in the account chain
    account_chain_ids = Account.account_chain_ids(account)
    requested_key_id = params[:developer_key_id]

    # Check if requested key is active in the account chain
    valid_key_ids = DeveloperKey.nondeleted.where(account_id: account_chain_ids).map(&:global_id)
    found = valid_key_ids.map(&:to_s).include?(requested_key_id)
    return if found

    # Check if requested key is active on site admin
    requested_key = DeveloperKey.find_cached(requested_key_id.to_i)
    found ||= requested_key.present? && requested_key.account.blank? && requested_key.active?

    raise ActiveRecord::RecordNotFound unless found
  end

  def require_manage_developer_keys
    require_context_with_permission(account, :manage_developer_keys)
  end

  def require_root_account
    raise ActiveRecord::RecordNotFound unless account.root_account?
  end

  def restrict_federated_child_accounts
    # Federated children can make their own keys, but for now, we are not letting
    # them turn on/off site admin account keys
    if !account.primary_settings_root_account? && developer_key.account != account
      raise ActiveRecord::RecordNotFound
    end
  end
end
