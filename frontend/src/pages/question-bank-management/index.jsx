import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLogout } from '../../context/SessionContext';
import RoleBasedHeader from '../../components/ui/RoleBasedHeader';
import SecurityBadgeDisplay from '../../components/ui/SecurityBadgeDisplay';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import { Checkbox } from '../../components/ui/Checkbox';
import QuestionCard from './components/QuestionCard';
import FilterPanel from './components/FilterPanel';
import BulkOperationsBar from './components/BulkOperationsBar';
import QuestionStatsCard from './components/QuestionStatsCard';
import QuestionPreviewModal from './components/QuestionPreviewModal';
import CreateQuestionModal from './components/CreateQuestionModal';
import { apiGet, apiPost, apiPut, apiDelete } from '../../services/httpClient';

const PAGE_SIZE = 10;

const QuestionBankManagement = () => {
  const { logout } = useLogout();
  const fileInputRef = useRef(null);

  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  const [filters, setFilters] = useState({
    searchQuery: '',
    subject: 'all',
    difficulty: 'all',
    type: 'all',
    sortBy: 'recent',
    onlyUnused: false,
    lowPerformance: false,
    hasImages: false,
    hasExplanations: false,
  });

  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [editQuestion, setEditQuestion] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchQuestions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiGet('/api/questions/');
      setQuestions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to load question bank');
      setQuestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // Compute real statistics from loaded questions
  const stats = useMemo(() => {
    const total = questions.length;
    const mcq = questions.filter((q) => q.type === 'mcq' || q.type === 'multiple-choice').length;
    const essay = questions.filter((q) => q.type === 'essay').length;
    const scores = questions.map((q) => Number(q.avgScore) || 0);
    const avgScore = total > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / total) : 0;
    return {
      totalQuestions: total,
      mcqCount: mcq,
      essayCount: essay,
      avgPerformance: avgScore,
    };
  }, [questions]);

  const availableSubjects = useMemo(() => {
    return Array.from(new Set(questions.map((q) => q.subject).filter(Boolean)));
  }, [questions]);

  // Real client-side filtering and sorting
  const filteredQuestions = useMemo(() => {
    let result = [...questions];

    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(
        (q) =>
          (q.questionText || q.text || '').toLowerCase().includes(query) ||
          (q.subject || '').toLowerCase().includes(query) ||
          (Array.isArray(q.tags) && q.tags.some((t) => String(t).toLowerCase().includes(query)))
      );
    }

    if (filters.subject !== 'all') {
      result = result.filter(
        (q) => (q.subject || '').toLowerCase() === filters.subject.toLowerCase()
      );
    }

    if (filters.difficulty !== 'all') {
      result = result.filter(
        (q) => (q.difficulty || '').toLowerCase() === filters.difficulty.toLowerCase()
      );
    }

    if (filters.type !== 'all') {
      result = result.filter((q) => {
        const t = (q.type || '').toLowerCase();
        if (filters.type === 'mcq') return t === 'mcq' || t === 'multiple-choice';
        return t === filters.type.toLowerCase();
      });
    }

    if (filters.onlyUnused) {
      result = result.filter((q) => Number(q.usageCount || 0) === 0);
    }

    if (filters.lowPerformance) {
      result = result.filter((q) => (Number(q.avgScore) || 0) < 60);
    }

    if (filters.hasExplanations) {
      result = result.filter((q) => Boolean(q.explanation && String(q.explanation).trim()));
    }

    // Sort
    result.sort((a, b) => {
      switch (filters.sortBy) {
        case 'oldest':
          return (a.created_at || a.createdDate || '').localeCompare(b.created_at || b.createdDate || '');
        case 'most-used':
          return (Number(b.usageCount) || 0) - (Number(a.usageCount) || 0);
        case 'highest-score':
          return (Number(b.avgScore) || 0) - (Number(a.avgScore) || 0);
        case 'lowest-score':
          return (Number(a.avgScore) || 0) - (Number(b.avgScore) || 0);
        case 'recent':
        default:
          return (b.created_at || b.createdDate || '').localeCompare(a.created_at || a.createdDate || '');
      }
    });

    return result;
  }, [questions, filters]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / PAGE_SIZE));
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredQuestions.slice(start, start + PAGE_SIZE);
  }, [filteredQuestions, currentPage]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      searchQuery: '',
      subject: 'all',
      difficulty: 'all',
      type: 'all',
      sortBy: 'recent',
      onlyUnused: false,
      lowPerformance: false,
      hasImages: false,
      hasExplanations: false,
    });
  };

  const handleSelectQuestion = (questionId) => {
    setSelectedQuestions((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedQuestions.length === paginatedQuestions.length && paginatedQuestions.length > 0) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(paginatedQuestions.map((q) => q.id));
    }
  };

  const handlePreview = (question) => {
    setPreviewQuestion(question);
    setShowPreviewModal(true);
  };

  const handleEdit = (question) => {
    setEditQuestion(question);
    setShowCreateModal(true);
  };

  const handleDuplicate = async (question) => {
    try {
      const payload = {
        type: question.type || 'mcq',
        subject: question.subject || null,
        difficulty: question.difficulty || null,
        questionText: `${question.questionText || question.text || ''} (Copy)`,
        options: Array.isArray(question.options) ? question.options : [],
        correctAnswer: question.correctAnswer || null,
        acceptedAnswers: Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [],
        explanation: question.explanation || null,
        tags: Array.isArray(question.tags) ? question.tags : [],
        marks: Number(question.marks) > 0 ? Number(question.marks) : 1,
      };
      await apiPost('/api/questions/', payload);
      setActionMessage('Question duplicated successfully');
      setTimeout(() => setActionMessage(null), 3500);
      await fetchQuestions();
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to duplicate question');
    }
  };

  const handleDelete = async (question) => {
    if (!window.confirm(`Delete question: "${(question.questionText || question.text || '').slice(0, 40)}..."?`)) {
      return;
    }
    try {
      await apiDelete(`/api/questions/${question.id}`);
      setSelectedQuestions((prev) => prev.filter((id) => id !== question.id));
      setActionMessage('Question deleted successfully');
      setTimeout(() => setActionMessage(null), 3500);
      await fetchQuestions();
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to delete question');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedQuestions.length === 0) return;
    if (!window.confirm(`Delete ${selectedQuestions.length} selected question(s)?`)) return;

    try {
      await Promise.all(selectedQuestions.map((id) => apiDelete(`/api/questions/${id}`)));
      setSelectedQuestions([]);
      setActionMessage('Selected questions deleted successfully');
      setTimeout(() => setActionMessage(null), 3500);
      await fetchQuestions();
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to delete selected questions');
    }
  };

  const handleBulkExport = () => {
    const toExport =
      selectedQuestions.length > 0
        ? questions.filter((q) => selectedQuestions.includes(q.id))
        : filteredQuestions;

    if (toExport.length === 0) return;

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(toExport, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `question-bank-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleBulkImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const questionsArray = Array.isArray(parsed) ? parsed : parsed.questions || [];
        if (!questionsArray || questionsArray.length === 0) {
          setError('No valid questions found in uploaded JSON file');
          return;
        }

        const formatted = questionsArray.map((q) => ({
          type: q.type || 'mcq',
          subject: q.subject || null,
          difficulty: q.difficulty || null,
          questionText: q.questionText || q.text || 'Imported Question',
          options: Array.isArray(q.options)
            ? q.options.map((opt) => (typeof opt === 'string' ? { text: opt, isCorrect: opt === q.correctAnswer } : opt))
            : [],
          correctAnswer: q.correctAnswer || null,
          acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
          explanation: q.explanation || null,
          tags: Array.isArray(q.tags) ? q.tags : [],
          marks: Number(q.marks) > 0 ? Number(q.marks) : 1,
        }));

        await apiPost('/api/questions/import', { questions: formatted });
        setActionMessage(`Successfully imported ${formatted.length} question(s)`);
        setTimeout(() => setActionMessage(null), 3500);
        await fetchQuestions();
      } catch (err) {
        setError(err?.detail || err?.message || 'Failed to parse or import question file');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleBulkTag = async (tag) => {
    if (!tag || selectedQuestions.length === 0) return;
    try {
      await Promise.all(
        selectedQuestions.map(async (id) => {
          const q = questions.find((item) => item.id === id);
          if (!q) return;
          const currentTags = Array.isArray(q.tags) ? q.tags : [];
          if (!currentTags.includes(tag)) {
            await apiPut(`/api/questions/${id}`, { tags: [...currentTags, tag] });
          }
        })
      );
      setActionMessage(`Tag "${tag}" added to selected questions`);
      setTimeout(() => setActionMessage(null), 3500);
      await fetchQuestions();
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to update tags');
    }
  };

  const handleSaveQuestion = async (questionData) => {
    if (questionData.id) {
      await apiPut(`/api/questions/${questionData.id}`, questionData);
      setActionMessage('Question updated successfully');
    } else {
      await apiPost('/api/questions/', questionData);
      setActionMessage('Question created successfully');
    }
    setTimeout(() => setActionMessage(null), 3500);
    await fetchQuestions();
  };

  return (
    <div className="min-h-screen bg-background">
      <RoleBasedHeader userRole="teacher" onLogout={logout} />
      <main className="pt-20 pb-12">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 lg:px-8">
          {/* Header & Primary Actions */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-heading font-bold text-foreground mb-2">
                  Question Bank Management
                </h1>
                <p className="text-sm md:text-base text-muted-foreground">
                  Create, organize, and manage your private assessment questions
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json"
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="default"
                  iconName="Filter"
                  iconPosition="left"
                  onClick={() => setShowFilters(!showFilters)}
                  className="lg:hidden"
                >
                  Filters
                </Button>
                <Button
                  variant="secondary"
                  size="default"
                  iconName="Upload"
                  iconPosition="left"
                  onClick={handleBulkImport}
                >
                  Import
                </Button>
                <Button
                  variant="default"
                  size="default"
                  iconName="Plus"
                  iconPosition="left"
                  onClick={() => {
                    setEditQuestion(null);
                    setShowCreateModal(true);
                  }}
                >
                  Create Question
                </Button>
              </div>
            </div>

            {/* Notification / Alert Banners */}
            {actionMessage && (
              <div className="mb-4 p-4 rounded-lg bg-success/10 border border-success/30 text-success text-sm flex items-center justify-between">
                <span>{actionMessage}</span>
                <button onClick={() => setActionMessage(null)} className="text-success hover:underline text-xs">
                  Dismiss
                </button>
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 rounded-lg bg-error/10 border border-error/30 text-error text-sm flex items-center justify-between">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={fetchQuestions}>
                  Retry
                </Button>
              </div>
            )}

            <QuestionStatsCard stats={stats} />
          </div>

          {selectedQuestions.length > 0 && (
            <div className="mb-6">
              <BulkOperationsBar
                selectedCount={selectedQuestions.length}
                onExport={handleBulkExport}
                onImport={handleBulkImport}
                onBulkDelete={handleBulkDelete}
                onBulkTag={handleBulkTag}
                onDeselectAll={() => setSelectedQuestions([])}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className={`lg:col-span-1 ${showFilters ? 'block' : 'hidden lg:block'}`}>
              <FilterPanel
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                availableSubjects={availableSubjects}
              />
            </div>

            <div className="lg:col-span-3 space-y-6">
              <div className="bg-card border border-border rounded-lg shadow-md p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      checked={
                        paginatedQuestions.length > 0 &&
                        selectedQuestions.length === paginatedQuestions.length
                      }
                      onChange={handleSelectAll}
                    />
                    <p className="text-sm font-medium text-foreground">
                      {filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''} found
                    </p>
                  </div>
                  {filteredQuestions.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconName="Download"
                      iconPosition="left"
                      onClick={handleBulkExport}
                    >
                      Export All
                    </Button>
                  )}
                </div>

                {/* Loading Skeleton */}
                {isLoading && (
                  <div className="space-y-4 py-4">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="animate-pulse p-4 border border-border rounded-lg space-y-3">
                        <div className="h-4 bg-muted rounded w-1/4"></div>
                        <div className="h-6 bg-muted rounded w-3/4"></div>
                        <div className="h-4 bg-muted rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State: No Questions At All */}
                {!isLoading && questions.length === 0 && (
                  <div className="text-center py-16 px-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Icon name="Database" size={32} className="text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">
                      No questions in your bank yet
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                      Questions you create will be securely stored and only visible to you when authoring exams.
                    </p>
                    <Button
                      variant="default"
                      size="default"
                      iconName="Plus"
                      iconPosition="left"
                      onClick={() => {
                        setEditQuestion(null);
                        setShowCreateModal(true);
                      }}
                    >
                      Create your first question
                    </Button>
                  </div>
                )}

                {/* Empty State: Filter Returned No Match */}
                {!isLoading && questions.length > 0 && filteredQuestions.length === 0 && (
                  <div className="text-center py-12 px-4">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                      <Icon name="Search" size={24} className="text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-1">
                      No matching questions found
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Try adjusting or clearing your filters to see more questions.
                    </p>
                    <Button variant="outline" size="sm" onClick={handleClearFilters}>
                      Clear Filters
                    </Button>
                  </div>
                )}

                {/* Question List */}
                {!isLoading && filteredQuestions.length > 0 && (
                  <div className="space-y-4">
                    {paginatedQuestions.map((question) => (
                      <div key={question.id} className="flex items-start space-x-3">
                        <div className="pt-6">
                          <Checkbox
                            checked={selectedQuestions.includes(question.id)}
                            onChange={() => handleSelectQuestion(question.id)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <QuestionCard
                            question={question}
                            onEdit={handleEdit}
                            onDuplicate={handleDuplicate}
                            onDelete={handleDelete}
                            onPreview={handlePreview}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Real Pagination */}
              {!isLoading && totalPages > 1 && (
                <div className="flex justify-center">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="ChevronLeft"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: totalPages }).map((_, index) => {
                        const pageNum = index + 1;
                        if (
                          pageNum === 1 ||
                          pageNum === totalPages ||
                          (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-8 h-8 md:w-10 md:h-10 rounded-md text-sm font-medium transition-smooth ${
                                currentPage === pageNum
                                  ? 'bg-primary text-primary-foreground font-bold'
                                  : 'hover:bg-muted text-foreground'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        }
                        if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                          return (
                            <span key={pageNum} className="text-muted-foreground px-1">
                              ...
                            </span>
                          );
                        }
                        return null;
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="ChevronRight"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <SecurityBadgeDisplay variant="footer" />
      {showPreviewModal && (
        <QuestionPreviewModal
          question={previewQuestion}
          onClose={() => {
            setShowPreviewModal(false);
            setPreviewQuestion(null);
          }}
        />
      )}
      {showCreateModal && (
        <CreateQuestionModal
          initialQuestion={editQuestion}
          onClose={() => {
            setShowCreateModal(false);
            setEditQuestion(null);
          }}
          onSave={handleSaveQuestion}
        />
      )}
    </div>
  );
};

export default QuestionBankManagement;
