/*
 * Copyright (C) 2021 - present Instructure, Inc.
 *
 * This file is part of Canvas.
 *
 * Canvas is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, version 3 of the License.
 *
 * Canvas is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 * A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {render, fireEvent} from '@testing-library/react'
import React from 'react'
import {GroupsMenu} from '../GroupsMenu'

const setup = props => {
  return render(<GroupsMenu {...props} />)
}

const defaultProps = {
  childTopics: [
    {
      _id: 'test_id_1',
      href: '/groups/1/discussion_topics/3',
      children: 'Group_Test_1',
      contextName: 'Group_Test_1',
      entryCounts: {unreadCount: 0},
      type: 'button',
      disabled: false,
    },
    {
      _id: 'test_id_2',
      href: '/groups/2/discussion_topics/4',
      children: 'Group_Test_2',
      contextName: 'Group_Test_2',
      entryCounts: {unreadCount: 5},
      type: 'button',
      disabled: false,
    },
  ],
}

describe('GroupsMenu', () => {
  describe('Rendering', () => {
    it('should render', () => {
      const component = setup(defaultProps)
      expect(component).toBeTruthy()
    })

    describe('when childTopics has elements', () => {
      it('should find button that is not disabled without a tooltip', () => {
        const {queryByTestId, queryByText} = setup(defaultProps)
        const button = queryByTestId('groups-menu-btn')
        expect(button).toBeTruthy()
        expect(button).not.toBeDisabled()
        expect(queryByText('There are no groups in this group set')).toBeFalsy()
      })

      it('should find the group names, and corresponding unread counts', () => {
        const {queryByText, queryAllByText, queryByTestId} = setup(defaultProps)
        expect(queryAllByText('Group_Test_1')).toEqual([])
        fireEvent.click(queryByTestId('groups-menu-btn'))
        expect(queryAllByText('Group_Test_1')).toHaveLength(2)
        expect(queryByText('0 Unread')).toBeTruthy()
        expect(queryAllByText('Group_Test_2')).toHaveLength(2)
        expect(queryByText('5 Unread')).toBeTruthy()
      })
    })

    describe('when childTopics is empty', () => {
      it('should find button that is disabled with a tooltip', () => {
        const {queryByTestId, queryByText} = setup({
          ...defaultProps,
          childTopics: [],
        })
        const button = queryByTestId('groups-menu-btn')
        expect(button).toBeTruthy()
        expect(button).toBeDisabled()
        expect(queryByText('There are no groups in this group set')).toBeTruthy()
      })
    })
  })
})
