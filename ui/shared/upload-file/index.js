/*
 * Copyright (C) 2017 - present Instructure, Inc.
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

import axios from '@canvas/axios'
import qs from 'qs'
import {useScope as createI18nScope} from '@canvas/i18n'
import resolveProgress from '@canvas/progress/resolve_progress'

const I18n = createI18nScope('upload_file')

// error interpretations. specifically avoid reporting an unhelpful "Network
// Error". TODO: more introspection of the errors for more detailed/specific
// error messages.
function preflightFailed(err) {
  if (err.message === 'Network Error') {
    const wrapped = new Error(I18n.t('Canvas failed to initiate the upload.'))
    wrapped.originalError = err
    return Promise.reject(wrapped)
  }
  return Promise.reject(err)
}

function fileUploadFailed(err) {
  if (err.message === 'Network Error') {
    // something broke in the attempt to upload the file before the storage
    // service could give a proper response. most likely is that an
    // authentication failure broke the OPTIONS pre-request, causing a CORS
    // fault
    const wrapped = new Error(
      I18n.t(
        'Unable to transmit file to the storage service. The service may be down or you may need to re-login to Canvas.',
      ),
    )
    wrapped.originalError = err
    return Promise.reject(wrapped)
  }
  return Promise.reject(err)
}

function postUploadFailed(err) {
  if (err.message === 'Network Error') {
    const wrapped = new Error(I18n.t('Canvas failed to complete the upload.'))
    wrapped.originalError = err
    return Promise.reject(wrapped)
  }
  return Promise.reject(err)
}

/*
 * preflightUrl: usually something like
 *   `/api/v1/courses/:course_id/files` or
 *   `/api/v1/folders/:folder_id/files`
 * preflightData: see api, but something like
 *   `{ name, size, parent_folder_path, type, on_duplicate }`
 *   note that `no_redirect: true` will be forced
 * file: the file object to upload.
 *   To get this off of an input element: `input.files[0]`
 *   To get this off of a drop event: `e.dataTransfer.files[0]`
 */
export function uploadFile(
  preflightUrl,
  preflightData,
  file,
  ajaxLib = axios,
  onProgress,
  ignoreResult = false,
) {
  if (!file && !preflightData.url) {
    throw new Error('expected either a file to upload or a url to clone', {file, preflightData})
  } else if (file && preflightData.url) {
    throw new Error("can't upload with both a file object and a url to clone", {
      file,
      preflightData,
    })
  }

  // force "no redirect" behavior. redirecting from the S3 POST breaks under
  // CORS in this pathway
  preflightData.no_redirect = true

  // when preflightData is flat, won't parse right on server as JSON, so force
  // into a query string
  if (preflightData['attachment[context_code]']) {
    preflightData = qs.stringify(preflightData)
  }

  return ajaxLib
    .post(preflightUrl, preflightData)
    .catch(preflightFailed)
    .then(response => completeUpload(response.data, file, {ajaxLib, onProgress, ignoreResult}))
}

/*
 * preflightResponse: the response from a preflight request. expected to
 *   contain an `upload_url` and `upload_params` at minimum. `file_param` and
 *   `success_url` are also recognized.
 * file: the file object to upload. see previous function
 * options: to tune or hook into the upload
 *   `filename`: a forced filename for the uploaded file
 *   `onProgress`: a callback to be triggered by upload progress events
 *   `ignoreResult`: after an upload, additional requests may be necessary to
 *     get the metadata about the file; this allows those to be skipped. any
 *     success_url will still be pinged.
 *   `includeAvatar`: if true, request avatar information when fetching file
 *     metadata after upload.
 */
export function completeUpload(preflightResponse, file, options = {}) {
  const ajaxLib = options.ajaxLib || axios
  const ajaxLibOptions = options.ajaxLibOptions || {}

  // account for attachments wrapped in array per JSON API format
  if (preflightResponse && preflightResponse.attachments && preflightResponse.attachments[0]) {
    preflightResponse = preflightResponse.attachments[0]
  }

  if (!preflightResponse) {
    throw new Error('expected a preflightResponse')
  } else if (file && !preflightResponse.upload_url) {
    throw new Error('expected a preflightResponse with an upload_url', {preflightResponse})
  } else if (!file && !preflightResponse.progress) {
    throw new Error('expected a preflightResponse with a progress', {preflightResponse})
  }

  const {upload_url, progress} = preflightResponse

  if (!upload_url) {
    // cloning a url and don't need to repost elsewhere, just wait on progress
    return resolveProgress(progress, {ajaxLib}).catch(postUploadFailed)
  }

  let {file_param, upload_params, success_url} = preflightResponse
  file_param = file_param || 'file'
  upload_params = upload_params || {}
  success_url = success_url || upload_params.success_url
  const isToS3 = !!success_url

  // post upload
  // xsslint xssable.receiver.whitelist formData
  const formData = new FormData()
  Object.entries(upload_params).forEach(([key, value]) => formData.append(key, value))
  if (file) {
    formData.append(file_param, file, options.filename)
  }

  const upload = ajaxLib.post(upload_url, formData, {
    responseType: isToS3 ? 'document' : 'json',
    onUploadProgress: options.onProgress,
    withCredentials: !isToS3,
    ...ajaxLibOptions,
  })

  // finalize upload
  return upload.catch(fileUploadFailed).then(response => {
    if (progress) {
      // cloning a url, wait on the progress object to complete, the return its
      // results as the data
      return resolveProgress(progress, {ajaxLib}).catch(postUploadFailed)
    }
    let location,
      query = {}
    if (success_url) {
      // s3 upload, follow-up at success_url with s3 data to finalize
      const {Bucket, Key, ETag} = response.data
      location = success_url
      query = {bucket: Bucket, key: Key, etag: ETag}
    } else if (response.status === 201 && !options.ignoreResult) {
      // inst-fs upload, follow-up at location from response
      location = response.data.location
      query = {}
    }
    if (location) {
      // include avatar in query if necessary
      if (options.includeAvatar) {
        query.include = 'avatar'
      }
      // send request to follow-up url with query
      query = qs.stringify(query)
      if (query) {
        if (location.indexOf('?') !== -1) {
          location = `${location}&${query}`
        } else {
          location = `${location}?${query}`
        }
      }
      return ajaxLib
        .get(location)
        .then(({data}) => data)
        .catch(postUploadFailed)
    } else {
      // local-storage upload, this _is_ the attachment information
      return response.data
    }
  })
}

/*
 * This is a helper file for uploading a file to a submissions comment
 * for a logged in user before actually creating the submissions comment
 *
 * @returns an array of attachment objects. The attachment objects contain ids
 * that a submissions comment can link to
 */
export function submissionCommentAttachmentsUpload(files, courseId, assignmentId, userId = 'self') {
  const preflightFileUploadUrl = `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}/comments/files`
  const uploadPromises = files.map(currentFile => {
    const preflightFileData = {
      name: currentFile.name,
      content_type: currentFile.type,
    }
    return uploadFile(preflightFileUploadUrl, preflightFileData, currentFile)
  })
  return Promise.all(uploadPromises)
}

/*
 * This is a helper function for uploading multiple files to a given
 * upload url
 *
 * @returns an array of attachment objects.
 */
export function uploadFiles(files, uploadUrl, options = {}) {
  // We differentiate between a normal file and an lti content item
  // based on the existence of a url attribute on the object. Then we invoke
  // the uploadFile function with different parameters based on whether its a
  // normal file or a content item backed by a file url. The parameters we are
  // providing are determined by the file uploads api whose documentation can
  // be found at /doc/api/file_uploads.md
  const uploadPromises = files.map(file => {
    if (options.conversations) {
      const attachmentInformation = {}
      attachmentInformation['attachment[folder_id]'] = ENV.CONVERSATIONS.ATTACHMENTS_FOLDER_ID
      attachmentInformation['attachment[intent]'] = 'message'
      attachmentInformation['attachment[filename]'] = file.name
      attachmentInformation['attachment[context_code]'] = `user_${ENV.current_user_id}`
      attachmentInformation['attachment[on_duplicate]'] = `rename`

      return uploadFile(uploadUrl, attachmentInformation, file)
    } else if (file.url) {
      // I believe this code is dead now, everything calling it seems to be
      // using files from a file input (the LTI path now uses uploadFiles in
      // AttemptTab), should we remove it?
      return uploadFile(uploadUrl, {
        url: file.url,
        name: file.text,
        content_type: file.mediaType,
        submit_assignment: false,
      })
    } else {
      return uploadFile(
        uploadUrl,
        {
          name: file.name,
          content_type: file.type,
        },
        file,
      )
    }
  })
  return Promise.all(uploadPromises)
}
