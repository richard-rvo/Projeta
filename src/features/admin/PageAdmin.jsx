import React, { useContext, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import ViewBar, { ViewBarSegments } from '../../components/shell/ViewBar';
import AdminOverview from './AdminOverview';
import AdminInvites from './AdminInvites';
import AdminUsers from './AdminUsers';

const SECTIONS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'invites', label: 'Convites' },
  { id: 'users', label: 'Usuários' },
];

export default function PageAdmin() {
  const { state } = useContext(AppContext);
  const [section, setSection] = useState('overview');

  if (!state.auth?.isPlatformAdmin) return null;

  return (
    <div className="flex h-full flex-col">
      <ViewBar>
        <ViewBarSegments options={SECTIONS} value={section} onChange={setSection} />
      </ViewBar>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {section === 'overview' && <AdminOverview />}
        {section === 'invites' && <AdminInvites />}
        {section === 'users' && <AdminUsers />}
      </div>
    </div>
  );
}
