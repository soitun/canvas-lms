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

import $ from 'jquery'
import 'jquery-migrate'
import '../activateElementToggler'

QUnit.module('elementToggler', {
  teardown() {
    ;[this.$trigger, this.$otherTrigger, this.$target, this.$target1, this.$target2].forEach(el => {
      if (el) el.remove()
    })
    $('#fixtures').empty()
  },
})

QUnit.skip('handles data-text-while-target-shown', function () {
  this.$trigger = $('<a>', {
    href: '#',
    class: 'element_toggler',
    role: 'button',
    'data-text-while-target-shown': 'Hide Thing',
    'aria-controls': 'thing',
    text: 'Show Thing',
  }).appendTo('#fixtures')

  this.$otherTrigger = $('<a>', {
    class: 'element_toggler',
    'data-text-while-target-shown': 'while shown',
    'aria-controls': 'thing',
    text: 'while hidden',
  }).appendTo('#fixtures')

  this.$target = $('<div>', {
    id: 'thing',
    tabindex: '-1',
    role: 'region',
    style: 'display:none',
    text: 'Here is a bunch more info about "thing"',
  }).appendTo('#fixtures')

  // click to show it
  this.$trigger.click()
  const msg = 'Handles `data-text-while-target-shown`'
  equal(this.$trigger.text(), 'Hide Thing', msg)
  equal(this.$otherTrigger.text(), 'while shown', msg)
  ok(
    this.$trigger.is(':visible'),
    'does not hide trigger unless `data-hide-while-target-shown` is specified'
  )
  this.$trigger.click()
  // click to hide it
  ok(this.$target.is('[aria-expanded=false]:hidden'), 'target is hidden')
  equal(this.$trigger.text(), 'Show Thing', msg)
  equal(this.$otherTrigger.text(), 'while hidden', msg)
})

QUnit.skip('handles data-hide-while-target-shown', function () {
  this.$trigger = $('<a>', {
    href: '#',
    class: 'element_toggler',
    'data-hide-while-target-shown': true,
    'aria-controls': 'thing',
    text: 'Show Thing, then hide me',
  }).appendTo('#fixtures')

  this.$otherTrigger = $('<a>', {
    class: 'element_toggler',
    'data-hide-while-target-shown': true,
    'aria-controls': 'thing',
    text: 'also hide me',
  }).appendTo('#fixtures')
  this.$target = $('<div>', {
    id: 'thing',
    tabindex: -1,
    role: 'region',
    style: 'display:none',
    text: 'blah',
  }).appendTo('#fixtures')
  this.$trigger.click()
  ok(this.$target.is('[aria-expanded=true]:visible'), 'target is shown')
  let msg = 'Does not change text unless `data-text-while-target-shown` is specified'
  equal($.trim(this.$trigger.text()), 'Show Thing, then hide me', msg)
  msg = 'Handles `data-hide-while-target-shown`'
  ok(this.$trigger.is(':hidden'), msg)
  ok(this.$otherTrigger.is(':hidden'), msg)
  this.$trigger.click()
  ok(this.$target.is('[aria-expanded=false]:hidden'), 'target is hidden')
  ok(this.$trigger.is(':visible'), msg)
  ok(this.$otherTrigger.is(':visible'), msg)
})

QUnit.skip('handles dialogs', function () {
  this.$trigger = $('<button>', {
    class: 'element_toggler',
    'aria-controls': 'thing',
    text: 'Show Thing Dialog',
  }).appendTo('#fixtures')

  // Step 1: Create the form element
  const $form = $('<form>', {
    id: 'thing',
    style: 'display:none',
    'data-turn-into-dialog': '{"width":450,"modal":true}',
  })
  ok(true)

  // Step 2: Add content to the form
  $form.append(`
  This will pop up as a dialog when you click the button and pass along the
  data-turn-into-dialog options. Then it will pass it through fixDialogButtons
  to turn the buttons in your markup into proper dialog buttons
  (look at fixDialogButtons to see what it does)
`)

  // Step 3: Create a div with class "button-container"
  const $buttonContainer = $('<div>', {
    class: 'button-container',
  })

  // Step 4: Create the submit button
  const $submitButton = $('<button>', {
    type: 'submit',
    text: 'This will Submit the form',
  })

  // Step 5: Create the anchor for closing the dialog
  const $closeAnchor = $('<a>', {
    class: 'btn dialog_closer',
    text: 'This will cause the dialog to close',
  })

  // Step 6: Append the buttons to the button container
  $buttonContainer.append($submitButton, $closeAnchor)

  // Step 7: Append the button container to the form
  $form.append($buttonContainer)

  // Step 8: Append the form to the element with ID "fixtures"
  this.$target = $form.appendTo('#fixtures')
  let msg = 'target pops up as a dialog'
  const spy = sandbox.spy($.fn, 'fixDialogButtons')
  this.$trigger.click()
  ok(this.$target.is(':ui-dialog:visible'), msg)
  ok(spy.thisValues[0].is(this.$target), 'calls fixDialogButton on @$trigger')
  msg = 'handles `data-turn-into-dialog` options correctly'
  equal(this.$target.dialog('option', 'width'), 450, msg)
  equal(this.$target.dialog('option', 'modal'), true, msg)
  msg =
    'make sure clicking on converted ui-dialog-buttonpane .ui-button causes submit handler to be called on form'
  let submitWasCalled = false
  this.$target.submit(() => {
    submitWasCalled = true
    return false
  })
  $submitButton.click()
  ok(submitWasCalled, msg)
  equal(this.$target.dialog('isOpen'), true, 'doesnt cause dialog to hide')
  msg = 'make sure clicking on the .dialog_closer causes dialog to close'
  const $closer = this.$target
    .dialog('widget')
    .find('.ui-dialog-buttonpane .ui-button:contains("This will cause the dialog to close")')
  $closer.click()
  equal(this.$target.dialog('isOpen'), false, msg)
  this.$trigger.click()
  equal(this.$target.dialog('isOpen'), true)
  this.$trigger.click()
  equal(this.$target.dialog('isOpen'), false)
})

QUnit.skip('checkboxes can be used as trigger', function () {
  this.$trigger = $(
    '<input type="checkbox" class="element_toggler" aria-controls="thing">'
  ).appendTo('#fixtures')
  this.$target = $('<div id="thing" style="display:none">thing</div>').appendTo('#fixtures')
  this.$trigger.prop('checked', true).trigger('change')
  ok(this.$target.is(':visible'), 'target is shown')
  this.$trigger.prop('checked', false).trigger('change')
  ok(this.$target.is(':hidden'), 'target is hidden')
})

QUnit.skip('toggles multiple elements separated by spaces', function () {
  this.$trigger = $(
    '<input type="checkbox" class="element_toggler" aria-controls="one two" />'
  ).appendTo('#fixtures')
  this.$target1 = $('<div id="one" style="display: none;">one</div>').appendTo('#fixtures')
  this.$target2 = $('<div id="two" style="display: none;">two</div>').appendTo('#fixtures')
  this.$trigger.prop('checked', true).trigger('change')
  ok(this.$target1.is(':visible'), 'first target is shown')
  ok(this.$target2.is(':visible'), 'second target is shown')
})

test('ignores attempts to trick jquery into creating HTML instead of selecting elements', function () {
  this.$trigger = $(
    '<a href="#" class="element_toggler" aria-controls="fake,.one">tricky</a>'
  ).appendTo('#fixtures')
  this.$target = $(`<div id="]<sneaky/>" class="one"/>`).appendTo('#fixtures')
  const spy = sandbox.spy($.fn, 'init')
  this.$trigger.click()
  notOk(spy.calledWithMatch(/sneaky/), 'sneaky selectors are discarded')
})
