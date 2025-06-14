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

import './image-block.css'
import {useScope as createI18nScope} from '@canvas/i18n'
import {BaseBlock, useIsEditMode} from '../BaseBlock'
import {ImageBlockEdit} from './ImageBlockEdit'
import {ImageBlockEditPreview} from './ImageBlockEditPreview'

const I18n = createI18nScope('page_editor')

const ImageBlockContent = (props: ImageBlockProps) => {
  const isEditMode = useIsEditMode()
  return isEditMode ? <ImageBlockEdit {...props} /> : <ImageBlockEditPreview {...props} />
}

export type ImageBlockProps = {
  url: string | undefined
  altText: string | undefined
}

export const ImageBlock = (props: ImageBlockProps) => {
  return (
    <BaseBlock title={I18n.t('Image Block')}>
      <ImageBlockContent {...props} />
    </BaseBlock>
  )
}
