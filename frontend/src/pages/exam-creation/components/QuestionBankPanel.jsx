import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Select from '../../../components/ui/Select';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';
import { apiRequest } from '../../../services/api';
import CreateQuestionModal from '../../question-bank-management/components/CreateQuestionModal';
import QuestionImportTemplate from './QuestionImportTemplate';

const arraysEqual = (left, right) => {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
};

const chooseSubsetForTargetMarks = (selectedQuestionIds, marksById, targetMarks) => {
  const target = Number(targetMarks);
  if (!Number.isFinite(target) || target <= 0 || !Array.isArray(selectedQuestionIds) || selectedQuestionIds.length === 0) {
    return selectedQuestionIds;
  }

  const weightedQuestions = selectedQuestionIds
    .map((id, index) => ({
      id,
      index,
      marks: Number(marksById.get(id) || 0),
    }))
    .filter((item) => Number.isFinite(item.marks) && item.marks > 0);

  if (weightedQuestions.length === 0) return selectedQuestionIds;

  const totalSelectedMarks = weightedQuestions.reduce((sum, item) => sum + item.marks, 0);
  if (totalSelectedMarks <= target) return selectedQuestionIds;

  const dp = new Map();
  dp.set(0, []);

  weightedQuestions.forEach((question) => {
    const next = new Map(dp);
    Array.from(dp.entries()).forEach(([sum, subset]) => {
      const newSum = sum + question.marks;
      if (newSum > target) return;
      const candidate = [...subset, question];
      const existing = next.get(newSum);
      if (!existing || candidate.length > existing.length) {
        next.set(newSum, candidate);
      }
    });
    dp.clear();
    next.forEach((value, key) => dp.set(key, value));
  });

  const bestSum = Math.max(...dp.keys());
  const bestSubset = dp.get(bestSum) || [];
  if (bestSubset.length === 0) return [];

  return bestSubset
    .sort((left, right) => left.index - right.index)
    .map((item) => item.id);
};

const QuestionBankPanel = ({ selectedQuestions, onQuestionsChange, targetTotalMarks }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [availableQuestions, setAvailableQuestions] = useState([]);
  const [banner, setBanner] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);
  const { getAccessTokenSilently } = useAuth0();

  const getToken = async () => {
    const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
    return getAccessTokenSilently({
      authorizationParams: {
        audience,
      },
    });
  };

  const loadQuestions = async () => {
    setIsLoading(true);
    try {
      const token = await getToken();
      const questions = await apiRequest('/api/questions/', 'GET', null, token);
      setAvailableQuestions(Array.isArray(questions) ? questions : []);
      setBanner(null);
    } catch (error) {
      setAvailableQuestions([]);
      setBanner({
        type: 'error',
        text: error?.detail || error?.message || 'Failed to load question bank',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  useEffect(() => {
    if (!Array.isArray(selectedQuestions) || selectedQuestions.length === 0 || availableQuestions.length === 0) return;

    const marksById = new Map(availableQuestions.map((question) => [question.id, Number(question?.marks) || 0]));
    const optimizedSelection = chooseSubsetForTargetMarks(selectedQuestions, marksById, targetTotalMarks);

    if (!arraysEqual(optimizedSelection, selectedQuestions)) {
      const selectedMarks = optimizedSelection.reduce((sum, id) => sum + (marksById.get(id) || 0), 0);
      onQuestionsChange(optimizedSelection);
      setBanner({
        type: 'success',
        text: `Questions auto-selected to fit ${selectedMarks} mark${selectedMarks === 1 ? '' : 's'}.`,
      });
    }
  }, [availableQuestions, selectedQuestions, targetTotalMarks]);

  const questionTypes = [
    { value: '', label: 'All Types' },
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'true-false', label: 'True/False' },
    { value: 'fill-blank', label: 'Fill in the Blanks' },
    { value: 'essay', label: 'Essay' },
  ];

  const difficultyLevels = [
    { value: '', label: 'All Difficulties' },
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
  ];

  const tagOptions = useMemo(() => {
    const tags = Array.from(
      new Set(
        availableQuestions.flatMap((question) =>
          Array.isArray(question?.tags) ? question.tags : []
        )
      )
    )
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return [
      { value: '', label: 'All Tags' },
      ...tags.map((tag) => ({ value: tag, label: tag })),
    ];
  }, [availableQuestions]);

  const filteredQuestions = availableQuestions.filter((question) => {
    const questionText = question?.text || question?.questionText || '';
    const matchesSearch = questionText.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !selectedType || question?.type === selectedType;
    const matchesDifficulty = !selectedDifficulty || question?.difficulty === selectedDifficulty;
    const matchesTag = !selectedTag || question?.tags?.includes(selectedTag);
    return matchesSearch && matchesType && matchesDifficulty && matchesTag;
  });

  const mergeSelectedQuestions = (questionIds) => {
    const merged = Array.from(new Set([...(selectedQuestions || []), ...questionIds]));
    onQuestionsChange(merged);
  };

  const selectedMarks = useMemo(() => {
    const marksById = new Map(availableQuestions.map((question) => [question.id, Number(question?.marks) || 0]));
    return (selectedQuestions || []).reduce((sum, id) => sum + (marksById.get(id) || 0), 0);
  }, [availableQuestions, selectedQuestions]);

  const handleQuestionToggle = (questionId) => {
    if (selectedQuestions?.includes(questionId)) {
      onQuestionsChange(selectedQuestions.filter((id) => id !== questionId));
    } else {
      onQuestionsChange([...(selectedQuestions || []), questionId]);
    }
  };

  const handleCreateQuestion = async (questionData) => {
    const token = await getToken();
    const createdQuestion = await apiRequest('/api/questions/', 'POST', questionData, token);
    setAvailableQuestions((prev) => [createdQuestion, ...prev]);
    mergeSelectedQuestions([createdQuestion.id]);
    setBanner({ type: 'success', text: 'Question created and added to this exam' });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event) => {
    const file = event?.target?.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsImporting(true);
    setBanner(null);

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const questions = Array.isArray(parsed) ? parsed : parsed?.questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Import file must contain a questions array');
      }

      const token = await getToken();
      const createdQuestions = await apiRequest('/api/questions/import', 'POST', { questions }, token);
      setAvailableQuestions((prev) => [...createdQuestions, ...prev]);
      mergeSelectedQuestions(createdQuestions.map((question) => question.id));
      setBanner({
        type: 'success',
        text: `${createdQuestions.length} question${createdQuestions.length === 1 ? '' : 's'} imported and selected`,
      });
    } catch (error) {
      setBanner({
        type: 'error',
        text: error?.detail || error?.message || 'Failed to import questions',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'mcq':
        return 'CheckSquare';
      case 'true-false':
        return 'ToggleLeft';
      case 'fill-blank':
        return 'Edit3';
      case 'essay':
        return 'FileText';
      default:
        return 'HelpCircle';
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy':
        return 'text-success bg-success/20';
      case 'medium':
        return 'text-accent bg-accent/20';
      case 'hard':
        return 'text-error bg-error/20';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-md">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
            <Icon name="Database" size={20} className="text-success" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground">Question Bank</h2>
            <p className="text-sm text-muted-foreground">Select questions from your question bank or add new ones here</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{selectedQuestions?.length || 0} Selected</p>
            <p className="text-xs text-muted-foreground">
              {selectedMarks} mark{selectedMarks === 1 ? '' : 's'} selected
              {Number(targetTotalMarks) > 0 ? ` / target ${targetTotalMarks}` : ''}
            </p>
          </div>
        </div>

        {banner && (
          <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${banner.type === 'error' ? 'bg-error/10 border border-error/30 text-error' : 'bg-success/10 border border-success/30 text-success'}`}>
            {banner.text}
          </div>
        )}

        <div className="space-y-4 mb-6">
          <Input
            type="search"
            placeholder="Search questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e?.target?.value || '')}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              placeholder="Filter by type"
              options={questionTypes}
              value={selectedType}
              onChange={setSelectedType}
            />
            <Select
              placeholder="Filter by difficulty"
              options={difficultyLevels}
              value={selectedDifficulty}
              onChange={setSelectedDifficulty}
            />
            <Select
              placeholder="Filter by tag"
              options={tagOptions}
              value={selectedTag}
              onChange={setSelectedTag}
            />
          </div>
        </div>

        <div className="mb-6">
          <QuestionImportTemplate />
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Loading questions...</div>
          ) : filteredQuestions?.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon name="Search" size={32} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No questions found matching your filters</p>
            </div>
          ) : (
            filteredQuestions.map((question) => (
              <div
                key={question?.id}
                className={`border rounded-lg p-4 transition-smooth cursor-pointer ${
                  selectedQuestions?.includes(question?.id)
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/30'
                }`}
                onClick={() => handleQuestionToggle(question?.id)}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    selectedQuestions?.includes(question?.id) ? 'bg-primary' : 'bg-muted'
                  }`}>
                    <Icon
                      name={selectedQuestions?.includes(question?.id) ? 'Check' : getTypeIcon(question?.type)}
                      size={16}
                      className={selectedQuestions?.includes(question?.id) ? 'text-primary-foreground' : 'text-muted-foreground'}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground mb-2">{question?.text || question?.questionText}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getDifficultyColor(question?.difficulty)}`}>
                        {question?.difficulty || 'unspecified'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                        {question?.type}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">
                        {question?.marks || 1} marks
                      </span>
                      {(question?.tags || []).map((tag) => (
                        <span key={`${question?.id}-${tag}`} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />

        <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <Button variant="outline" iconName="Plus" iconPosition="left" onClick={() => setShowCreateModal(true)}>
            Create New Question
          </Button>
          <Button
            variant="outline"
            iconName="Upload"
            iconPosition="left"
            onClick={handleImportClick}
            loading={isImporting}
          >
            Import Questions
          </Button>
        </div>
      </div>

      {showCreateModal && (
        <CreateQuestionModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateQuestion}
        />
      )}
    </>
  );
};

export default QuestionBankPanel;
