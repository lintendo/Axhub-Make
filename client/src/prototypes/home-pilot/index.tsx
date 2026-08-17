/**
 * @name 首页工作台（home-pilot）
 */
import React, { useMemo, useState } from 'react';
import { defineHashPageRoute, useHashPage } from '../../common/useHashPage';
import {
  AnnotationViewer,
  type AnnotationDirectoryRouteNode,
  type AnnotationSourceDocument,
  type AnnotationViewerOptions,
} from '@axhub/annotation';
import { AppTopNav, type TopNavKey } from './components/PrototypeUI';
import annotationSourceDocument from './annotation-source.json';
import { HomePage } from './pages/HomePage';
import { MeetingCreatePage } from './pages/MeetingCreatePage';
import { MeetingTodoPage } from './pages/MeetingTodoPage';
import { MeetingArchivePage } from './pages/MeetingArchivePage';
import { MeetingListPage } from './pages/MeetingListPage';
import { MeetingDetailPage } from './pages/MeetingDetailPage';
import { RegulationPage } from './pages/RegulationPage';
import { RegulationCreatePage } from './pages/RegulationCreatePage';
import { ResearchListPage } from './pages/ResearchListPage';
import { ResearchDetailPage } from './pages/ResearchDetailPage';
import { ResearchCreatePage } from './pages/ResearchCreatePage';
import { InfoCreatePage } from './pages/InfoCreatePage';
import { InfoListPage } from './pages/InfoListPage';
import { InfoDetailPage } from './pages/InfoDetailPage';
import { MyInitiationPage } from './pages/MyInitiationPage';
import { SignCreatePage } from './pages/sign/SignCreatePage';
import { SignDetailPage } from './pages/sign/SignDetailPage';
import { SignApproveDeptPage } from './pages/sign/SignApproveDeptPage';
import { SignApproveOfficePage } from './pages/sign/SignApproveOfficePage';
import { SignApproveSecretaryPage } from './pages/sign/SignApproveSecretaryPage';
import { SignDeliverPage } from './pages/sign/SignDeliverPage';
import { SignBoardPage } from './pages/sign/SignBoardPage';
import { SignFinishPage } from './pages/sign/SignFinishPage';
import { SignPartyOfficeClerkPage } from './pages/sign/SignPartyOfficeClerkPage';
import { SignOfficeDirectorPage } from './pages/sign/SignOfficeDirectorPage';
import { getInfoDetail } from './mock';
import './prototype-ui.css';
import './style.css';

const route = defineHashPageRoute(
  [
    { id: 'home', title: '首页' },
    { id: 'regulation', title: '制度列表' },
    { id: 'regulation-create', title: '制度发起' },
    { id: 'meeting-create', title: '会议发起' },
    { id: 'meeting-todo', title: '会议发起待办审批' },
    { id: 'meeting-archive', title: '会议材料归档' },
    { id: 'meeting-list', title: '会议列表' },
    { id: 'meeting-detail', title: '会议材料归档详情' },
    { id: 'research-list', title: '调研列表' },
    { id: 'research-detail', title: '调研详情' },
    { id: 'research-create', title: '调研发起' },
    { id: 'info-list', title: '信息列表' },
    { id: 'info-detail', title: '信息详情' },
    { id: 'info-create', title: '董事参考' },
    { id: 'my-initiation', title: '我的发起' },
    { id: 'sign-create', title: '发起签字流程' },
    { id: 'sign-detail', title: '签字详情' },
    { id: 'sign-approve-dept', title: '部室负责人审批' },
    { id: 'sign-approve-office', title: '董办负责人审批' },
    { id: 'sign-approve-secretary', title: '董秘审批' },
    { id: 'sign-deliver', title: '经办人呈送' },
    { id: 'sign', title: '董事签署' },
    { id: 'sign-party-office-clerk', title: '党组组织部文书办理' },
    { id: 'sign-office-director', title: '办公室主任办理' },
    { id: 'sign-finish', title: '办结' },
  ],
  { defaultPageId: 'home' },
);

function getActiveNavKey(page: string): TopNavKey {
  if (page === 'regulation' || page === 'regulation-create') {
    return 'rule';
  }
  if (page === 'research-list' || page === 'research-detail' || page === 'research-create') {
    return 'research';
  }
  if (page === 'meeting-list' || page === 'meeting-detail' || page.startsWith('meeting-')) {
    return 'meeting';
  }
  if (page === 'info-list' || page === 'info-detail' || page === 'info-create') {
    return 'info';
  }
  if (page === 'my-initiation') {
    return 'mine';
  }
  if (page === 'sign' || page.startsWith('sign-')) {
    return 'home';
  }
  return 'home';
}

export default function HomePilot() {
  const { page, setPage } = useHashPage(route);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [selectedInfoId, setSelectedInfoId] = useState<string>('');
  const [selectedResearchId, setSelectedResearchId] = useState<string>('');
  const [selectedSignTaskId, setSelectedSignTaskId] = useState<string>('sign-001');
  const [signReturnPage, setSignReturnPage] = useState<'home' | 'my-initiation'>('home');

  const navigateToSign = (
    signPage: string,
    taskId?: string,
    returnPage: 'home' | 'my-initiation' = 'home',
  ) => {
    setSelectedSignTaskId(taskId || 'sign-001');
    setSignReturnPage(returnPage);
    setPage(signPage);
  };

  const viewerOptions = useMemo<AnnotationViewerOptions>(
    () => ({
      currentPageId: page,
      toolbarEdge: 'right',
      showToolbar: true,
      showThemeToggle: false,
      showColorFilter: false,
      emptyWhenNoData: true,
      onDirectoryRoute: (node: AnnotationDirectoryRouteNode) => {
        if (typeof node.route === 'string') {
          setPage(node.route);
        }
      },
    }),
    [page],
  );

  const handleNavigate = (key: TopNavKey) => {
    if (key === 'home') {
      setPage('home');
      return true;
    }
    if (key === 'rule') {
      setPage('regulation');
      return true;
    }
    if (key === 'research') {
      setPage('research-list');
      return true;
    }
    if (key === 'meeting') {
      setPage('meeting-list');
      return true;
    }
    if (key === 'info') {
      setPage('info-list');
      return true;
    }
    if (key === 'mine') {
      setPage('my-initiation');
      return true;
    }
    return false;
  };

  return (
    <div className="swb-app">
      <AppTopNav activeKey={getActiveNavKey(page)} onNavigate={handleNavigate} />
      <div className="swb-content">
        {page === 'home' && (
          <HomePage
            onCreateRegulation={() => setPage('regulation-create')}
            onCreateMeeting={() => setPage('meeting-create')}
            onMeetingTodo={() => setPage('meeting-todo')}
            onCreateArchive={() => setPage('meeting-archive')}
            onCreateResearch={() => setPage('research-create')}
            onCreateInfo={() => setPage('info-create')}
            onCreateSign={() => navigateToSign('sign-create', undefined, 'home')}
            onSignTodoClick={(taskId, signPage) => navigateToSign(signPage, taskId, 'home')}
          />
        )}
        {page === 'regulation' && <RegulationPage />}
        {page === 'regulation-create' && <RegulationCreatePage onBack={() => setPage('home')} />}
        {page === 'meeting-create' && <MeetingCreatePage onBack={() => setPage('home')} />}
        {page === 'meeting-todo' && <MeetingTodoPage onBack={() => setPage('home')} />}
        {page === 'meeting-archive' && <MeetingArchivePage onBack={() => setPage('home')} />}
        {page === 'meeting-list' && (
          <MeetingListPage
            onViewDetail={(id) => {
              setSelectedMeetingId(id);
              setPage('meeting-detail');
            }}
          />
        )}
        {page === 'meeting-detail' && (
          <MeetingDetailPage id={selectedMeetingId} onBack={() => setPage('meeting-list')} />
        )}
        {page === 'research-list' && (
          <ResearchListPage
            onViewDetail={(id) => {
              setSelectedResearchId(id);
              setPage('research-detail');
            }}
          />
        )}
        {page === 'research-detail' && (
          <ResearchDetailPage
            id={selectedResearchId}
            onBack={() => setPage('research-list')}
          />
        )}
        {page === 'research-create' && <ResearchCreatePage onBack={() => setPage('home')} />}
        {page === 'info-list' && (
          <InfoListPage
            onOpenDetail={(id) => {
              setSelectedInfoId(id);
              setPage('info-detail');
            }}
          />
        )}
        {page === 'info-detail' && (
          <InfoDetailPage detail={getInfoDetail(selectedInfoId)} onBack={() => setPage('info-list')} />
        )}
        {page === 'info-create' && <InfoCreatePage onBack={() => setPage('home')} />}
        {page === 'my-initiation' && (
          <MyInitiationPage
            onViewSignDetail={(taskId) => navigateToSign('sign-detail', taskId, 'my-initiation')}
            onEditSign={(taskId) => navigateToSign('sign-create', taskId, 'my-initiation')}
          />
        )}
        {page === 'sign-create' && <SignCreatePage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />}
        {page === 'sign-detail' && <SignDetailPage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />}
        {page === 'sign-approve-dept' && (
          <SignApproveDeptPage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />
        )}
        {page === 'sign-approve-office' && (
          <SignApproveOfficePage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />
        )}
        {page === 'sign-approve-secretary' && (
          <SignApproveSecretaryPage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />
        )}
        {page === 'sign-deliver' && <SignDeliverPage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />}
        {page === 'sign' && <SignBoardPage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />}
        {page === 'sign-party-office-clerk' && (
          <SignPartyOfficeClerkPage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />
        )}
        {page === 'sign-office-director' && (
          <SignOfficeDirectorPage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />
        )}
        {page === 'sign-finish' && <SignFinishPage taskId={selectedSignTaskId} onBack={() => setPage(signReturnPage)} />}
      </div>

      <AnnotationViewer
        source={annotationSourceDocument as AnnotationSourceDocument}
        options={viewerOptions}
      />
    </div>
  );
}
