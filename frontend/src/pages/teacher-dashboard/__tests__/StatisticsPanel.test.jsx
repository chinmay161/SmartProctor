import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import StatisticsPanel from '../components/StatisticsPanel';

describe('StatisticsPanel', () => {
  it('renders — for null/empty values', () => {
    const html = renderToString(<StatisticsPanel statistics={{}} />);
    expect(html).toContain('—');
  });

  it('shows real data, not fake hardcoded subLabels or dead export button', () => {
    const html = renderToString(
      <StatisticsPanel
        statistics={{
          DRAFT: 2,
          SCHEDULED: 1,
          ACTIVE: 1,
          ENDED: 3,
          attention: {
            live_exams: 1,
            awaiting_grading_total: 5,
            results_unpublished: 2,
            unreviewed_violations_total: 10,
            pending_disputes_total: 3,
          },
        }}
      />
    );
    expect(html).toContain('Total Exams');
    expect(html).toContain('7'); // 2 + 1 + 1 + 3
    expect(html).toContain('Active Now');
    expect(html).toContain('Awaiting Grading');
    expect(html).toContain('Pending Disputes');
    expect(html).toContain('Results to Publish');

    // Must not contain fake subLabels
    expect(html).not.toContain('+12% from last semester');
    expect(html).not.toContain('+8% enrollment increase');
    expect(html).not.toContain('+3.5% improvement');
    expect(html).not.toContain('-15% from last semester');

    // Must not contain dead export button
    expect(html).not.toContain('Export Full Report');
  });
});
