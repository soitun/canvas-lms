/*
 * Copyright (C) 2025 - present Instructure, Inc.
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

import React from 'react'
import {useScope as createI18nScope} from '@canvas/i18n'
import {Alert} from '@instructure/ui-alerts'
import {Text} from '@instructure/ui-text'

const I18n = createI18nScope('discussion_insights')

const NewActivityInfo = () => {
  return (
    <Alert
      variant="info"
      hasShadow={false}
      data-testid="new-activity-alert"
      renderCloseButtonLabel="Close"
      margin="0 0 large 0"
    >
      <Text>{I18n.t('The discussion board has some new activity since the last insights were generated.')}</Text>
    </Alert>
  )
}

export default NewActivityInfo
