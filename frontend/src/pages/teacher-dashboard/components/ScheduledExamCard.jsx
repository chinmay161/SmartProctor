import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const ScheduledExamCard = ({ exam, onEdit, onDelete }) => {
  const createdAt = exam?.created_at ? new Date(exam.created_at).toLocaleString() : 'N/A';

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden transition-smooth hover:shadow-lg">
      <div className="p-4 md:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-base md:text-lg font-heading font-semibold text-foreground truncate">{exam?.title}</h3>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {exam?.description || 'No description added'}
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-accent/20 text-accent shrink-0">
            Scheduled
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Duration</div>
            <div className="text-foreground font-medium">{exam?.duration_minutes ? `${exam.duration_minutes} min` : 'Not set'}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Questions</div>
            <div className="text-foreground font-medium">{exam?.question_ids?.length || 0}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Created</div>
            <div className="text-foreground text-xs">{createdAt}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            iconName="Edit"
            onClick={() => onEdit?.(exam)}
            className="flex-1"
          >
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            iconName="Trash2"
            onClick={() => onDelete?.(exam)}
            className="flex-1"
          >
            Delete
          </Button>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Icon name="Clock" size={14} />
            Ready
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduledExamCard;
