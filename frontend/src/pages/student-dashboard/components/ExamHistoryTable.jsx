import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';

const ExamHistoryTable = ({ examHistory }) => {
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');

  const courseOptions = [
    { value: 'all', label: 'All Courses' },
    { value: 'mathematics', label: 'Mathematics' },
    { value: 'physics', label: 'Physics' },
    { value: 'chemistry', label: 'Chemistry' },
    { value: 'computer-science', label: 'Computer Science' }
  ];

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'passed', label: 'Passed' },
    { value: 'failed', label: 'Failed' }
  ];

  const sortOptions = [
    { value: 'date-desc', label: 'Date (Newest)' },
    { value: 'date-asc', label: 'Date (Oldest)' },
    { value: 'score-desc', label: 'Score (Highest)' },
    { value: 'score-asc', label: 'Score (Lowest)' }
  ];

  const getScoreColor = (percentage) => {
    if (percentage >= 90) return 'text-success';
    if (percentage >= 75) return 'text-primary';
    if (percentage >= 60) return 'text-accent';
    return 'text-error';
  };

  const filteredHistory = examHistory?.filter(exam => {
      if (filterCourse !== 'all' && exam?.courseId !== filterCourse) return false;
      if (filterStatus !== 'all') {
        const percentage = (exam?.score / exam?.totalMarks) * 100;
        if (filterStatus === 'passed' && percentage < 60) return false;
        if (filterStatus === 'failed' && percentage >= 60) return false;
      }
      return true;
    })?.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.completedDate) - new Date(a.completedDate);
        case 'date-asc':
          return new Date(a.completedDate) - new Date(b.completedDate);
        case 'score-desc':
          return (b?.score / b?.totalMarks) - (a?.score / a?.totalMarks);
        case 'score-asc':
          return (a?.score / a?.totalMarks) - (b?.score / b?.totalMarks);
        default:
          return 0;
      }
    });

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <h3 className="text-lg md:text-xl font-heading font-semibold text-foreground mb-4">
          Exam History
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Course"
            options={courseOptions}
            value={filterCourse}
            onChange={setFilterCourse}
          />
          <Select
            label="Status"
            options={statusOptions}
            value={filterStatus}
            onChange={setFilterStatus}
          />
          <Select
            label="Sort By"
            options={sortOptions}
            value={sortBy}
            onChange={setSortBy}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Exam
              </th>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Score
              </th>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 md:px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredHistory?.map((exam) => {
              const percentage = (exam?.score / exam?.totalMarks) * 100;
              const isPassed = percentage >= 60;

              return (
                <tr key={exam?.id} className="hover:bg-muted/30 transition-smooth">
                  <td className="px-4 md:px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{exam?.examTitle}</p>
                      <p className="text-xs text-muted-foreground">{exam?.course}</p>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 text-sm text-foreground">
                    {new Date(exam.completedDate)?.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <div>
                      <p className={`text-sm font-data font-semibold ${getScoreColor(percentage)}`}>
                        {exam?.score}/{exam?.totalMarks}
                      </p>
                      <p className={`text-xs ${getScoreColor(percentage)}`}>
                        {percentage?.toFixed(1)}%
                      </p>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${
                      isPassed
                        ? 'bg-success/20 text-success' :'bg-error/20 text-error'
                    }`}>
                      <Icon name={isPassed ? 'CheckCircle' : 'XCircle'} size={14} className="mr-1" />
                      {isPassed ? 'Passed' : 'Failed'}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Button variant="ghost" size="sm" iconName="Eye">
                        View
                      </Button>
                      <Button variant="ghost" size="sm" iconName="Download">
                        PDF
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filteredHistory?.length === 0 && (
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="FileText" size={32} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No exam history found</p>
        </div>
      )}
    </div>
  );
};

export default ExamHistoryTable;