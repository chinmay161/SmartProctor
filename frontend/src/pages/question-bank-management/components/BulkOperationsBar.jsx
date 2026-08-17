import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';

const BulkOperationsBar = ({ selectedCount, onExport, onImport, onBulkDelete, onBulkTag, onDeselectAll }) => {
  const [showTagInput, setShowTagInput] = useState(false);
  const [selectedTag, setSelectedTag] = useState('');

  const tagOptions = [
    { value: 'midterm', label: 'Midterm' },
    { value: 'final', label: 'Final Exam' },
    { value: 'quiz', label: 'Quiz' },
    { value: 'practice', label: 'Practice' },
    { value: 'advanced', label: 'Advanced' },
    { value: 'basic', label: 'Basic' }
  ];

  const handleBulkTag = () => {
    if (selectedTag) {
      onBulkTag(selectedTag);
      setSelectedTag('');
      setShowTagInput(false);
    }
  };

  return (
    <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 md:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Icon name="CheckSquare" size={20} className="text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm md:text-base font-medium text-foreground">
              {selectedCount} question{selectedCount !== 1 ? 's' : ''} selected
            </p>
            <button
              onClick={onDeselectAll}
              className="text-xs md:text-sm text-primary hover:text-primary/80 transition-smooth"
            >
              Deselect all
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            iconName="Download"
            iconPosition="left"
            onClick={onExport}
          >
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconName="Upload"
            iconPosition="left"
            onClick={onImport}
          >
            Import
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconName="Tag"
            iconPosition="left"
            onClick={() => setShowTagInput(!showTagInput)}
          >
            Add Tags
          </Button>
          <Button
            variant="destructive"
            size="sm"
            iconName="Trash2"
            iconPosition="left"
            onClick={onBulkDelete}
          >
            Delete
          </Button>
        </div>
      </div>

      {showTagInput && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <Select
              placeholder="Select tag to add"
              options={tagOptions}
              value={selectedTag}
              onChange={setSelectedTag}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleBulkTag}
              disabled={!selectedTag}
            >
              Apply Tag
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowTagInput(false);
                setSelectedTag('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkOperationsBar;