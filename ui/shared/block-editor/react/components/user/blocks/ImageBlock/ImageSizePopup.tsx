/*
 * Copyright (C) 2024 - present Instructure, Inc.
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

import React, {useCallback, useEffect, useState} from 'react'
import {useNode} from '@craftjs/core'
import {FormFieldGroup, type FormMessage} from '@instructure/ui-form-field'
import {Button, IconButton} from '@instructure/ui-buttons'
import {RangeInput} from '@instructure/ui-range-input'
import {Popover} from '@instructure/ui-popover'
import {ScreenReaderContent} from '@instructure/ui-a11y-content'
import {View} from '@instructure/ui-view'
import {IconResize} from '../../../../assets/internal-icons'
import {type ImageBlockProps} from './types'

import {useScope as useI18nScope} from '@canvas/i18n'

const I18n = useI18nScope('block-editor/image-block')

type IconSizePopupProps = {
  width: number
  height: number
}

const IconSizePopup = ({width, height}: IconSizePopupProps) => {
  const {
    actions: {setProp},
    domnode,
  } = useNode(node => ({
    props: node.data.props,
    domnode: node.dom as HTMLImageElement,
  }))
  const [widthValue, setWidthValue] = useState<number>(() => {
    return width || domnode.clientWidth
  })
  const [heightValue, setHeightValue] = useState<number>(() => {
    return height || domnode.clientHeight
  })
  const [aspectRatio] = useState<number>(() => {
    const w = width || domnode.clientWidth
    const h = height || domnode.clientHeight
    return w / h
  })
  const [isShowingContent, setIsShowingContent] = useState(false)

  useEffect(() => {
    setWidthValue(width || domnode.clientWidth)
    setHeightValue(height || domnode.clientHeight)
  }, [width, height, domnode.clientWidth, domnode.clientHeight])

  const handleShowContent = useCallback(() => {
    setIsShowingContent(true)
  }, [])

  const handleHideContent = useCallback(() => {
    setIsShowingContent(false)
  }, [])

  const handleChangeWidth = useCallback(
    (value: number | string) => {
      const w = typeof value === 'number' ? value : parseInt(value, 10)
      const h = Math.round(w / aspectRatio)
      setWidthValue(w)
      setHeightValue(h)
    },
    [aspectRatio]
  )

  const handleChangeHeight = useCallback(
    (value: number | string) => {
      const h = typeof value === 'number' ? value : parseInt(value, 10)
      setHeightValue(h)
      const w = Math.round(h * aspectRatio)
      setWidthValue(w)
    },
    [aspectRatio]
  )

  const setImageSize = useCallback(() => {
    setProp((prps: ImageBlockProps) => {
      prps.width = widthValue
      prps.height = heightValue
    })
    setIsShowingContent(false)
  }, [heightValue, setProp, widthValue])

  return (
    <Popover
      renderTrigger={
        <IconButton
          size="small"
          withBackground={false}
          withBorder={false}
          screenReaderLabel={I18n.t('Image Size')}
        >
          <IconResize size="x-small" />
        </IconButton>
      }
      isShowingContent={isShowingContent}
      onShowContent={handleShowContent}
      onHideContent={handleHideContent}
      on="click"
      screenReaderLabel={I18n.t('Popover Dialog Example')}
      shouldContainFocus={true}
      shouldReturnFocus={true}
      shouldCloseOnDocumentClick={true}
    >
      <View as="div" margin="small">
        <FormFieldGroup
          description={<ScreenReaderContent>Image size</ScreenReaderContent>}
          rowSpacing="small"
          layout="stacked"
        >
          <RangeInput
            label={I18n.t('Width')}
            value={widthValue}
            width="15rem"
            min={1}
            max={window.innerWidth}
            step={10}
            size="small"
            thumbVariant="accessible"
            onChange={handleChangeWidth}
          />
          <RangeInput
            label={I18n.t('Height')}
            value={heightValue}
            width="15rem"
            min={1}
            max={window.innerWidth / aspectRatio}
            step={10}
            size="small"
            thumbVariant="accessible"
            onChange={handleChangeHeight}
          />
        </FormFieldGroup>
        <View as="div" textAlign="end" margin="x-small 0 0 0">
          <Button onClick={setImageSize}>{I18n.t('Set')}</Button>
        </View>
      </View>
    </Popover>
  )
}

export {IconSizePopup}
