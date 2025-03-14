/*
 * Copyright (C) 2013 - present Instructure, Inc.
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

import $ from 'jquery'
import 'jquery-migrate'
import '../outerclick'
describe('outerclick', () => {
  it('should work', () => {
    const handler = jest.fn()
    const $doc = $(document.body)
    const $foo = $('<b>hello <i>world</i></b>').appendTo($doc)
    $foo.on('outerclick', handler)

    $foo.click()
    $foo.find('i').click()
    expect(handler).not.toHaveBeenCalled()

    $doc.click()
    expect(handler).toHaveBeenCalledTimes(1)

    $foo.remove()
  })
})
