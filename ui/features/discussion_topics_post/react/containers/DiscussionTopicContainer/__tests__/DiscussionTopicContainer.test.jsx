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

import {AlertManagerContext} from '@canvas/alerts/react/AlertManager'
import {assignLocation, openWindow} from '@canvas/util/globalUtils'
import {MockedProviderWithPossibleTypes as MockedProvider} from '@canvas/util/react/testing/MockedProviderWithPossibleTypes'
import {waitFor} from '@testing-library/dom'
import {fireEvent, render} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import useManagedCourseSearchApi from '../../../../../../shared/direct-sharing/react/effects/useManagedCourseSearchApi'
import {Assignment} from '../../../../graphql/Assignment'
import {Discussion} from '../../../../graphql/Discussion'
import {DiscussionPermissions} from '../../../../graphql/DiscussionPermissions'
import {
  deleteDiscussionTopicMock,
  updateDiscussionReadStateMock,
  updateDiscussionTopicMock,
} from '../../../../graphql/Mocks'
import {PeerReviews} from '../../../../graphql/PeerReviews'
import {getSpeedGraderUrl, responsiveQuerySizes} from '../../../utils'
import {DiscussionTopicContainer} from '../DiscussionTopicContainer'

// mock assignLocation
jest.mock('@canvas/util/globalUtils', () => ({
  assignLocation: jest.fn(),
  openWindow: jest.fn(),
}))

jest.mock('../../../../../../shared/direct-sharing/react/effects/useManagedCourseSearchApi')
jest.mock('@canvas/rce/RichContentEditor')
jest.mock('../../../utils', () => ({
  ...jest.requireActual('../../../utils'),
  responsiveQuerySizes: jest.fn(),
}))

describe('DiscussionTopicContainer', () => {
  const setOnFailure = jest.fn()
  const setOnSuccess = jest.fn()
  let liveRegion = null

  beforeAll(() => {
    window.ENV = {
      EDIT_URL: 'this_is_the_edit_url',
      PEER_REVIEWS_URL: 'this_is_the_peer_reviews_url',
      context_asset_string: 'course_1',
      course_id: '1',
      context_type: 'Course',
      context_id: '1',
      discussion_topic_menu_tools: [
        {
          base_url: 'example.com',
          canvas_icon_class: 'icon-commons',
          id: '1',
          title: 'Share to Commons',
        },
      ],
    }

    window.matchMedia = jest.fn().mockImplementation(() => {
      return {
        matches: true,
        media: '',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      }
    })

    if (!document.getElementById('flash_screenreader_holder')) {
      liveRegion = document.createElement('div')
      liveRegion.id = 'flash_screenreader_holder'
      liveRegion.setAttribute('role', 'alert')
      document.body.appendChild(liveRegion)
    }

    window.INST = {
      editorButtons: [],
    }
  })

  beforeEach(() => {
    responsiveQuerySizes.mockImplementation(() => ({
      desktop: {maxWidth: '1000px'},
    }))
    useManagedCourseSearchApi.mockImplementation(() => {})
  })

  afterEach(() => {
    setOnFailure.mockClear()
    setOnSuccess.mockClear()
    jest.clearAllMocks()
  })

  afterAll(() => {
    if (liveRegion) {
      liveRegion.remove()
    }
  })

  const setup = (props, mocks) => {
    return render(
      <MockedProvider mocks={mocks}>
        <AlertManagerContext.Provider value={{setOnFailure, setOnSuccess}}>
          <DiscussionTopicContainer {...props} />
        </AlertManagerContext.Provider>
      </MockedProvider>,
    )
  }
  it('publish button is readonly if canUnpublish is false', async () => {
    const {getByText} = setup({discussionTopic: Discussion.mock({canUnpublish: false})})

    expect(getByText('Published').closest('button').hasAttribute('disabled')).toBeTruthy()
  })

  it('renders a special alert for differentiated group assignments for readAsAdmin', async () => {
    const container = setup({
      discussionTopic: Discussion.mock({
        assignment: Assignment.mock({onlyVisibleToOverrides: true}),
      }),
    })
    expect(
      container.getByText(
        'Note: for differentiated group topics, some threads may not have any students assigned.',
      ),
    ).toBeInTheDocument()
  })

  it('renders without optional props', async () => {
    const container = setup({discussionTopic: Discussion.mock({assignment: {}})})
    expect(container.getByTestId('replies-counter')).toBeInTheDocument()
  })

  it('renders infoText only when there are replies', async () => {
    const container = setup({discussionTopic: Discussion.mock()})
    const infoText = await container.findByTestId('replies-counter')
    expect(infoText).toHaveTextContent('56 Replies, 2 Unread')
  })

  it('does not render unread when there are none', async () => {
    const container = setup({
      discussionTopic: Discussion.mock({
        entryCounts: {
          repliesCount: 24,
          unreadCount: 0,
        },
      }),
    })
    const infoText = await container.findByTestId('replies-counter')
    expect(infoText).toHaveTextContent('24 Replies')
  })

  it('should be able to send to edit page when canUpdate', async () => {
    const {getByTestId, getByText} = setup({discussionTopic: Discussion.mock()})
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Edit'))

    await waitFor(() => {
      expect(assignLocation).toHaveBeenCalledWith(window.ENV.EDIT_URL)
    })
  })

  it('should be able to send to peer reviews page when canPeerReview', async () => {
    const {getByTestId, getByText} = setup({discussionTopic: Discussion.mock()})
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Peer Reviews'))

    await waitFor(() => {
      expect(assignLocation).toHaveBeenCalledWith(window.ENV.PEER_REVIEWS_URL)
    })
  })

  it('Should be able to delete topic', async () => {
    window.confirm = jest.fn(() => true)
    const {getByTestId, getByText} = setup(
      {discussionTopic: Discussion.mock()},
      deleteDiscussionTopicMock(),
    )
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Delete'))

    await waitFor(() =>
      expect(setOnSuccess).toHaveBeenCalledWith('The discussion topic was successfully deleted.'),
    )
    await waitFor(() => {
      expect(assignLocation).toHaveBeenCalledWith('/courses/1/discussion_topics')
    })
  })

  it('Should be able to delete announcement', async () => {
    window.confirm = jest.fn(() => true)
    const {getByTestId, getByText} = setup(
      {discussionTopic: Discussion.mock({isAnnouncement: true})},
      deleteDiscussionTopicMock(),
    )
    await userEvent.click(getByTestId('discussion-post-menu-trigger'))
    await userEvent.click(getByText('Delete'))

    await waitFor(() =>
      expect(setOnSuccess).toHaveBeenCalledWith('The discussion topic was successfully deleted.'),
    )
    await waitFor(() => {
      expect(assignLocation).toHaveBeenCalledWith('/courses/1/announcements')
    })
  })

  it('Should not be able to delete the topic if does not have permission', async () => {
    const {getByTestId, queryByTestId} = setup({
      discussionTopic: Discussion.mock({permissions: DiscussionPermissions.mock({delete: false})}),
    })
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    expect(queryByTestId('delete')).toBeNull()
  })

  it('renders Speed Grader button in the menu', () => {
    const props = {discussionTopic: Discussion.mock()}
    const {getByTestId, getByText} = setup(props)
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))

    expect(getByText('Open in SpeedGrader')).toBeTruthy()
  })

  it('Should be able to open SpeedGrader', async () => {
    const {getByTestId, getByText} = setup({discussionTopic: Discussion.mock()})
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Open in SpeedGrader'))

    await waitFor(() => {
      expect(openWindow).toHaveBeenCalledWith(getSpeedGraderUrl(), '_blank')
    })
  })

  it('Should not be able to see post menu if no permissions and initialPostRequiredForCurrentUser', () => {
    const {queryByTestId} = setup({
      discussionTopic: Discussion.mock({
        initialPostRequiredForCurrentUser: true,
        permissions: DiscussionPermissions.mock({
          canDelete: false,
          copyAndSendTo: false,
          update: false,
          moderateForum: false,
          speedGrader: false,
          peerReview: false,
          showRubric: false,
          addRubric: false,
          openForComments: false,
          closeForComments: false,
          manageContent: false,
          manageCourseContentAdd: false,
          manageCourseContentEdit: false,
          manageCourseContentDelete: false,
        }),
      }),
    })

    expect(queryByTestId('discussion-post-menu-trigger')).toBeNull()
  })

  it('Should show Mark All as Read discussion topic menu if initialPostRequiredForCurrentUser = false', async () => {
    const {getByTestId, getByText} = setup({
      discussionTopic: Discussion.mock({initialPostRequiredForCurrentUser: false}),
    })
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    expect(getByText('Mark All as Read')).toBeInTheDocument()
  })

  it('Should show Mark All as Unread discussion topic menu if initialPostRequiredForCurrentUser = false', async () => {
    const {getByTestId, getByText} = setup({
      discussionTopic: Discussion.mock({initialPostRequiredForCurrentUser: false}),
    })
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    expect(getByText('Mark All as Unread')).toBeInTheDocument()
  })

  it('Should be able to click Mark All as Read and call mutation', async () => {
    const {getByTestId, getByText} = setup(
      {discussionTopic: Discussion.mock({initialPostRequiredForCurrentUser: false})},
      updateDiscussionReadStateMock(),
    )
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Mark All as Read'))

    await waitFor(() =>
      expect(setOnSuccess).toHaveBeenCalledWith('You have successfully marked all as read.'),
    )
  })

  it('Should be able to click Mark All as Unread and call mutation', async () => {
    const {getByTestId, getByText} = setup(
      {discussionTopic: Discussion.mock({initialPostRequiredForCurrentUser: false})},
      updateDiscussionReadStateMock({read: false}),
    )
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Mark All as Unread'))

    await waitFor(() =>
      expect(setOnSuccess).toHaveBeenCalledWith('You have successfully marked all as unread.'),
    )
  })

  it('Renders Open for Comments in the kabob menu if the user has permission', () => {
    const {getByTestId, getByText} = setup({discussionTopic: Discussion.mock()})
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    expect(getByText('Open for Comments')).toBeInTheDocument()
  })

  it('Renders Close for Comments in the kabob menu if the user has permission', () => {
    const {getByTestId, getByText} = setup({
      discussionTopic: Discussion.mock({
        rootTopic: null,
        permissions: DiscussionPermissions.mock({closeForComments: true}),
      }),
    })
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    expect(getByText('Close for Comments')).toBeInTheDocument()
  })

  it('does not render Close for Comments even when there is permission if child topic', () => {
    const container = setup({
      discussionTopic: Discussion.mock({
        permissions: DiscussionPermissions.mock({closeForComments: true}),
      }),
    })
    fireEvent.click(container.getByTestId('discussion-post-menu-trigger'))
    expect(container.queryByText('Close for Comments')).toBeNull()
  })

  it('Renders Copy To and Send To in the kabob menu if the user has permission', () => {
    const {getByTestId, getByText} = setup({discussionTopic: Discussion.mock()})

    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    expect(getByText('Copy To...')).toBeInTheDocument()
    expect(getByText('Send To...')).toBeInTheDocument()
  })

  it('renders a modal to send content', async () => {
    const container = setup({discussionTopic: Discussion.mock()})
    const kebob = await container.findByTestId('discussion-post-menu-trigger')
    fireEvent.click(kebob)

    const sendToButton = await container.findByText('Send To...')
    fireEvent.click(sendToButton)
    expect(await container.findByText('Send to:')).toBeInTheDocument()
  })

  it('renders a modal to copy content', async () => {
    const container = setup({discussionTopic: Discussion.mock()})
    const kebob = await container.findByTestId('discussion-post-menu-trigger')
    fireEvent.click(kebob)

    const copyToButton = await container.findByText('Copy To...')
    fireEvent.click(copyToButton)
    expect(await container.findByText('Select a Course')).toBeInTheDocument()
  })

  it('can send users to Commons if they can manageContent', async () => {
    const discussionTopic = Discussion.mock()
    const {getByTestId, getByText} = setup({discussionTopic})
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Share to Commons'))

    await waitFor(() => {
      expect(assignLocation).toHaveBeenCalledWith(
        `example.com&discussion_topics%5B%5D=${discussionTopic._id}`,
      )
    })
  })

  it('renders an attachment if it exists', async () => {
    const container = setup({discussionTopic: Discussion.mock()})
    expect(await container.findByText('288777.jpeg')).toBeInTheDocument()
  })

  it('renders "discussion topic closed for comments" message if user has reply permission false', async () => {
    const container = setup({
      discussionTopic: Discussion.mock({permissions: DiscussionPermissions.mock({reply: false})}),
    })

    expect(await container.findByText('This is a Discussion Topic Message')).toBeInTheDocument()
    expect(await container.findByTestId('discussion-topic-closed-for-comments')).toBeInTheDocument()
  })

  it('does not renders "discussion topic closed for comments" message if user has reply permission true', () => {
    const container = setup({discussionTopic: Discussion.mock()})

    expect(container.queryByTestId('discussion-topic-closed-for-comments')).toBeNull()
  })

  it('renders a reply button if user has reply permission true', async () => {
    const container = setup({discussionTopic: Discussion.mock()})

    expect(await container.findByText('This is a Discussion Topic Message')).toBeInTheDocument()
    expect(await container.findByTestId('discussion-topic-reply')).toBeInTheDocument()
  })

  it('does not render a reply button if user has reply permission false', () => {
    const container = setup({
      discussionTopic: Discussion.mock({permissions: DiscussionPermissions.mock({reply: false})}),
    })

    expect(container.queryByTestId('discussion-topic-reply')).toBeNull()
  })

  it('should not render group menu button when there is child topics but no group set', () => {
    const container = setup({discussionTopic: Discussion.mock({groupSet: null})})

    expect(container.queryByTestId('groups-menu-btn')).toBeFalsy()
  })

  it('Should be able to close for comments', async () => {
    const {getByText, getByTestId} = setup(
      {
        discussionTopic: Discussion.mock({
          rootTopic: null,
          permissions: DiscussionPermissions.mock({closeForComments: true}),
        }),
      },
      updateDiscussionTopicMock({locked: true}),
    )
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Close for Comments'))

    await waitFor(() =>
      expect(setOnSuccess).toHaveBeenCalledWith(
        'You have successfully updated the discussion topic.',
      ),
    )
  })

  it('Should be able to open for comments', async () => {
    const {getByText, getByTestId} = setup(
      {discussionTopic: Discussion.mock()},
      updateDiscussionTopicMock({locked: false}),
    )
    fireEvent.click(getByTestId('discussion-post-menu-trigger'))
    fireEvent.click(getByText('Open for Comments'))

    await waitFor(() =>
      expect(setOnSuccess).toHaveBeenCalledWith(
        'You have successfully updated the discussion topic.',
      ),
    )
  })

  it('should show discussion availability container for ungraded discussions', () => {
    const mockSections = [
      {
        id: 'U2VjdGlvbi00',
        _id: '1',
        userCount: 5,
        name: 'section 1',
      },
      {
        id: 'U2VjdGlvbi00',
        _id: '2',
        userCount: 99,
        name: 'section 2',
      },
    ]

    const container = setup({
      discussionTopic: Discussion.mock({
        assignment: null,
        courseSections: mockSections,
        delayedPostAt: '2021-03-21T00:00:00-06:00',
        lockAt: '2021-09-03T23:59:59-06:00',
        groupSet: null,
      }),
    })

    expect(container.getByTestId('view-availability-button')).toBeTruthy()
  })

  it('Renders an alert if initialPostRequiredForCurrentUser is true', () => {
    const props = {discussionTopic: Discussion.mock({initialPostRequiredForCurrentUser: true})}
    const container = setup(props)
    waitFor(() =>
      expect(
        container.queryByText(
          'You must post before seeing replies. Edit history will be available to instructors.',
        ),
      ).toBeInTheDocument(),
    )
  })

  it('Renders an alert if announcement will post in the future', () => {
    const props = {
      discussionTopic: Discussion.mock({
        isAnnouncement: true,
        delayedPostAt: '3000-01-01T13:40:50-06:00',
      }),
    }
    const container = setup(props)
    expect(
      container.getByText('This announcement will not be visible until Jan 1, 3000 7:40pm.'),
    ).toBeTruthy()
  })

  it('should not render author if author is null', async () => {
    const props = {discussionTopic: Discussion.mock({author: null})}
    const container = setup(props)
    const pillContainer = container.queryAllByTestId('pill-Author')
    expect(pillContainer).toEqual([])
  })

  it('should render editedBy if editor is different from author', async () => {
    const props = {
      discussionTopic: Discussion.mock({
        editor: {
          id: 'vfx5000',
          _id: '99',
          displayName: 'Eddy Tor',
          avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        },
      }),
    }
    const container = setup(props)
    const editedByTextElement = container.getByTestId('editedByText')
    expect(editedByTextElement.textContent).toEqual('Edited by Eddy Tor Apr 22, 2021 6:41pm')
    expect(container.queryByTestId('created-tooltip')).toBeFalsy()
  })

  it('should render plain edited if author is editor', async () => {
    const props = {
      discussionTopic: Discussion.mock({
        editor: {
          id: 'abc3244',
          _id: '1',
          name: 'Charles Xavier',
          avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        },
      }),
    }
    const container = setup(props)
    expect(
      container.getByText('Last edited Apr 22, 2021 6:41pm', {exact: false}),
    ).toBeInTheDocument()
    expect(container.queryByTestId('created-tooltip')).toBeFalsy()
  })

  it('should not render edited info if no editor', async () => {
    const props = {
      discussionTopic: Discussion.mock({
        editor: null,
      }),
    }
    const container = setup(props)
    expect(container.queryByText(/Edited by/)).toBeFalsy()
    expect(container.queryByTestId('created-tooltip')).toBeFalsy()
  })

  describe('AvailableForUser', () => {
    it('topic is unavailable', () => {
      const props = {
        discussionTopic: Discussion.mock({
          availableForUser: false,
          title: 'This topic is unavailable',
        }),
      }
      const container = setup(props)
      expect(container.queryByText('This topic is unavailable')).toBeInTheDocument()
      expect(container.getByTestId('locked-discussion')).toBeInTheDocument()
    })

    it('topic is available', () => {
      const props = {
        discussionTopic: Discussion.mock({
          availableForUser: true,
          title: 'This topic is available',
        }),
      }
      const container = setup(props)
      expect(container.queryByText('This topic is available')).toBeInTheDocument()
      expect(container.queryByTestId('locked-discussion')).toBeNull()
    })
  })

  describe('Peer Reviews', () => {
    it('renders Peer Reviews button in the menu', () => {
      const props = {discussionTopic: Discussion.mock()}
      const {getByTestId, getByText} = setup(props)
      fireEvent.click(getByTestId('discussion-post-menu-trigger'))

      expect(getByText('Peer Reviews')).toBeTruthy()
    })

    it('renders with a due date', () => {
      const props = {discussionTopic: Discussion.mock()}
      const {getByText} = setup(props)

      expect(getByText('Peer review for Morty Smith Due: Mar 31, 2021 5:59am')).toBeTruthy()
    })

    it('renders with out a due date', () => {
      const props = {
        discussionTopic: Discussion.mock({
          assignment: Assignment.mock({
            peerReviews: PeerReviews.mock({dueAt: null}),
          }),
        }),
      }
      const {getByText} = setup(props)

      expect(getByText('Peer review for Morty Smith')).toBeTruthy()
    })

    it('does not render peer reviews if there are not any', () => {
      const props = {
        discussionTopic: Discussion.mock({
          peerReviews: null,
          assessmentRequestsForCurrentUser: [],
        }),
      }
      const {queryByText} = setup(props)

      expect(queryByText('eer review for Morty Smith Due: Mar 31, 2021 5:59am')).toBeNull()
    })

    describe('PodcastFeed Button', () => {
      afterEach(() => {
        // Clean up any podcast feed links added to document head
        const podcastLinks = document.querySelectorAll('link[type="application/rss+xml"]')
        podcastLinks.forEach(link => link.remove())
      })

      it('does not render when Discussion Podcast Feed is not present', () => {
        const {queryByTestId} = setup({discussionTopic: Discussion.mock()})
        expect(queryByTestId('post-rssfeed')).toBeNull()
      })

      it('renders when Discussion Podcast Feed is present', () => {
        const ln = document.createElement('link')
        ln.title = 'Discussion Podcast Feed'
        ln.type = 'application/rss+xml'
        ln.href = 'http://localhost:3000/feeds/topics/47/enrollment_mhumV2R51z5IsK.rss'
        document.head.append(ln)

        const {getByTestId} = setup({discussionTopic: Discussion.mock()})
        expect(getByTestId('post-rssfeed')).toBeTruthy()
      })
    })

    describe('Rubric', () => {
      it('Renders Add Rubric in the kabob menu if the user has permission', () => {
        const {getByTestId, getByText} = setup({discussionTopic: Discussion.mock()})
        fireEvent.click(getByTestId('discussion-post-menu-trigger'))
        expect(getByText('Add Rubric')).toBeInTheDocument()
      })

      it('Renders Show Rubric in the kabob menu if the user has permission', () => {
        const {getByTestId, getByText} = setup({
          discussionTopic: Discussion.mock({
            permissions: DiscussionPermissions.mock({
              addRubric: false,
            }),
          }),
        })
        fireEvent.click(getByTestId('discussion-post-menu-trigger'))
        expect(getByText('Show Rubric')).toBeInTheDocument()
      })

      it('Renders hidden add_rubric_url for form if the user has permission', () => {
        const {getByTestId} = setup({discussionTopic: Discussion.mock()})
        expect(getByTestId('add_rubric_url')).toBeTruthy()
      })

      it('Does Not Render hidden add_rubric_url for form if the user does not have permission', () => {
        const {queryByTestId} = setup({
          discussionTopic: Discussion.mock({
            permissions: DiscussionPermissions.mock({
              addRubric: false,
            }),
          }),
        })
        expect(queryByTestId('add_rubric_url')).toBeNull()
      })
    })
  })

  describe('Discussion Summary', () => {
    it('should render the discussion summary button if user can summarize and summary is not enabled', () => {
      ENV.user_can_summarize = true
      ENV.discussion_summary_enabled = false
      const {queryByTestId} = setup({
        discussionTopic: Discussion.mock(),
      })

      expect(queryByTestId('summarize-button')).toBeTruthy()
    })

    it('should render discussion summary button with Close Summary if summary is enabled', () => {
      ENV.user_can_summarize = true
      ENV.discussion_summary_enabled = true
      const {queryByTestId} = setup({
        discussionTopic: Discussion.mock(),
      })

      expect(queryByTestId('summarize-button').textContent).toBe('Close Summary')
    })

    it('should not render the discussion summary button if user can not summarize', () => {
      ENV.user_can_summarize = false
      ENV.discussion_summary_enabled = false
      const {queryByTestId} = setup({
        discussionTopic: Discussion.mock(),
      })

      expect(queryByTestId('summarize-button')).toBeNull()
    })

    it('renders a summary', () => {
      ENV.discussion_summary_enabled = true
      ENV.user_can_summarize = true
      const {queryByTestId} = setup({
        discussionTopic: Discussion.mock(),
      })
      expect(queryByTestId('summary-loading')).toBeTruthy()
    })

    it('does not render a summary', () => {
      ENV.discussion_summary_enabled = false
      ENV.user_can_summarize = true
      const {queryAllByTestId} = setup({
        discussionTopic: Discussion.mock(),
      })
      expect(queryAllByTestId(/summary-.*/)).toEqual([])
    })
  })
})
