import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../api/client';
import { formatDateTimeWIB, parseToDate } from '../utils/dateUtils';

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000); // live polling for background jobs
    return () => clearInterval(interval);
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await api.get('/jobs?limit=50');
      setJobs(res.data);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: '#ffffff' }}>
            Ingestion & Processing Jobs
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Live status of asynchronous Celery workers vectorizing and analyzing knowledge sources
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchJobs}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px' }}>Job ID</th>
              <th style={{ padding: '12px' }}>Source Name</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px' }}>Records / Chunks</th>
              <th style={{ padding: '12px' }}>Entities</th>
              <th style={{ padding: '12px' }}>Relations</th>
              <th style={{ padding: '12px' }}>Started (WIB)</th>
              <th style={{ padding: '12px' }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  No jobs logged yet.
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const startTime = parseToDate(job.started_at);
                const endTime = parseToDate(job.completed_at);
                const duration = startTime && endTime ? `${Math.max(0, Math.round((endTime - startTime) / 1000))}s` : startTime ? 'In progress' : '-';

                return (
                  <tr key={job.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13px' }}>
                    <td style={{ padding: '14px 12px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                      #{job.id}
                    </td>
                    <td style={{ padding: '14px 12px', fontWeight: '600', color: '#ffffff' }}>
                      {job.source_name}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <span className={`badge ${job.status === 'completed' ? 'badge-success' : job.status === 'processing' ? 'badge-info' : 'badge-danger'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--text-secondary)' }}>
                      {job.total_records && job.total_records > job.chunks_created
                        ? `${job.total_records.toLocaleString()} rec (${job.chunks_created} chk)`
                        : `${job.chunks_created || 0} chunks`}
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--accent-cyan)' }}>
                      {job.entities_extracted}
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--accent-primary)' }}>
                      {job.relations_created}
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDateTimeWIB(job.started_at)}
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--text-secondary)' }}>
                      {duration}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
