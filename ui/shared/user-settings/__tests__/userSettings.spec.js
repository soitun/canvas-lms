/*
 * Copyright (C) 2012 - present Instructure, Inc.
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

import userSettings from '../index'

describe('UserSettings', () => {
  const originalEnv = window.ENV

  beforeEach(() => {
    // Setup a fresh environment
    window.ENV = {
      current_user_id: 1,
      context_asset_string: 'course_1',
    }
    userSettings.globalEnv = window.ENV
  })

  afterEach(() => {
    // Restore the original environment
    window.ENV = originalEnv
  })

  test('`get` should return what was `set`', () => {
    userSettings.set('foo', 'bar')
    expect(userSettings.get('foo')).toBe('bar')
  })

  test('it should stringify/parse JSON', () => {
    const testObject = {
      foo: [1, 2, 3],
      bar: 'true',
      baz: true,
    }
    userSettings.set('foo', testObject)
    expect(userSettings.get('foo')).toEqual(testObject)
  })

  test('it should store different things for different users', () => {
    userSettings.set('foo', 1)
    window.ENV.current_user_id = 2 // Change user
    userSettings.set('foo', 2)

    expect(userSettings.get('foo')).toBe(2)

    window.ENV.current_user_id = 1 // Revert to original user
    expect(userSettings.get('foo')).toBe(1)
  })

  test('it should store different things for different contexts', () => {
    userSettings.contextSet('foo', 1)
    window.ENV.context_asset_string = 'course_2' // Change context
    userSettings.contextSet('foo', 2)

    expect(userSettings.contextGet('foo')).toBe(2)

    window.ENV.context_asset_string = 'course_1' // Revert to original context
    expect(userSettings.contextGet('foo')).toBe(1)
  })
})
