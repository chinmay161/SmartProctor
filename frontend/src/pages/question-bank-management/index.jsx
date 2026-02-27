import React, { useState, useEffect } from 'react';
import { useLogout } from '../../context/SessionContext';
import RoleBasedHeader from '../../components/ui/RoleBasedHeader';
import SecurityBadgeDisplay from '../../components/ui/SecurityBadgeDisplay';

import Button from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import QuestionCard from './components/QuestionCard';
import FilterPanel from './components/FilterPanel';
import BulkOperationsBar from './components/BulkOperationsBar';
import QuestionStatsCard from './components/QuestionStatsCard';
import QuestionPreviewModal from './components/QuestionPreviewModal';
import CreateQuestionModal from './components/CreateQuestionModal';

const QuestionBankManagement = () => {
  const [filters, setFilters] = useState({
    searchQuery: '',
    subject: 'all',
    difficulty: 'all',
    type: 'all',
    sortBy: 'recent',
    onlyUnused: false,
    lowPerformance: false,
    hasImages: false,
    hasExplanations: false
  });

  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const sampleQuestions = [
    {
      id: 1,
      type: 'mcq',
      subject: 'Mathematics',
      difficulty: 'medium',
      questionText: 'What is the derivative of f(x) = 3x² + 2x - 5?',
      options: [
        { text: '6x + 2', isCorrect: true },
        { text: '3x + 2', isCorrect: false },
        { text: '6x - 2', isCorrect: false },
        { text: '3x² + 2', isCorrect: false }
      ],
      explanation: 'Using the power rule, the derivative of 3x² is 6x, the derivative of 2x is 2, and the derivative of a constant is 0.',
      tags: ['Calculus', 'Derivatives', 'Midterm'],
      usageCount: 45,
      avgScore: 78,
      avgTime: 120,
      createdDate: '01/15/2026'
    },
    {
      id: 2,
      type: 'true-false',
      subject: 'Physics',
      difficulty: 'easy',
      questionText: 'The speed of light in vacuum is approximately 300,000 km/s.',
      correctAnswer: 'True',
      explanation: 'The speed of light in vacuum is exactly 299,792,458 m/s, which is approximately 300,000 km/s.',
      tags: ['Optics', 'Constants', 'Quiz'],
      usageCount: 67,
      avgScore: 92,
      avgTime: 45,
      createdDate: '01/10/2026'
    },
    {
      id: 3,
      type: 'fill-blank',
      subject: 'Chemistry',
      difficulty: 'hard',
      questionText: 'The process by which a solid changes directly to a gas without passing through the liquid state is called _______.',
      acceptedAnswers: ['sublimation', 'Sublimation'],
      explanation: 'Sublimation is the phase transition where a substance changes from solid to gas without becoming liquid first. Examples include dry ice and iodine.',
      tags: ['Phase Changes', 'Thermodynamics', 'Final'],
      usageCount: 23,
      avgScore: 54,
      avgTime: 180,
      createdDate: '01/05/2026'
    },
    {
      id: 4,
      type: 'essay',
      subject: 'Biology',
      difficulty: 'hard',
      questionText: 'Explain the process of photosynthesis and its importance in the ecosystem. Include the chemical equation and describe the light-dependent and light-independent reactions.',
      explanation: 'Expected answer should cover: 6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂, light-dependent reactions in thylakoids, light-independent reactions (Calvin cycle) in stroma, and ecological importance.',
      tags: ['Photosynthesis', 'Plant Biology', 'Final'],
      usageCount: 12,
      avgScore: 71,
      avgTime: 900,
      createdDate: '12/28/2025'
    },
    {
      id: 5,
      type: 'mcq',
      subject: 'Computer Science',
      difficulty: 'medium',
      questionText: 'Which data structure uses LIFO (Last In First Out) principle?',
      options: [
        { text: 'Queue', isCorrect: false },
        { text: 'Stack', isCorrect: true },
        { text: 'Array', isCorrect: false },
        { text: 'Linked List', isCorrect: false }
      ],
      explanation: 'A stack follows the LIFO principle where the last element added is the first one to be removed, like a stack of plates.',
      tags: ['Data Structures', 'Algorithms', 'Midterm'],
      usageCount: 89,
      avgScore: 85,
      avgTime: 90,
      createdDate: '01/18/2026'
    },
    {
      id: 6,
      type: 'mcq',
      subject: 'Mathematics',
      difficulty: 'easy',
      questionText: 'What is the value of π (pi) rounded to two decimal places?',
      options: [
        { text: '3.12', isCorrect: false },
        { text: '3.14', isCorrect: true },
        { text: '3.16', isCorrect: false },
        { text: '3.18', isCorrect: false }
      ],
      explanation: 'Pi (π) is approximately 3.14159, which rounds to 3.14 when rounded to two decimal places.',
      tags: ['Geometry', 'Constants', 'Basic'],
      usageCount: 156,
      avgScore: 94,
      avgTime: 30,
      createdDate: '01/12/2026'
    }
  ];

  const [questions, setQuestions] = useState(sampleQuestions);

  // backend-driven: questions come from API

  const stats = {
    totalQuestions: 247,
    mcqCount: 156,
    essayCount: 34,
    avgPerformance: 76
  };

  useEffect(() => {
    let mounted = true;
    const fetchQuestions = async () => {
      try {
        const qs = await import('../../services/httpClient').then(m => m.apiGet('/api/questions'));
        if (!mounted) return;
        setQuestions(qs || []);
      } catch (err) {
        setQuestions([]);
      }
    };

    fetchQuestions();
    return () => { mounted = false; };
  }, []);

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
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
      hasExplanations: false
    });
  };

  const handleSelectQuestion = (questionId) => {
    setSelectedQuestions(prev =>
      prev?.includes(questionId)
        ? prev?.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleSelectAll = () => {
    const source = questions || [];
    if (selectedQuestions?.length === source?.length) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(source?.map(q => q?.id));
    }
  };

  const handlePreview = (question) => {
    setPreviewQuestion(question);
    setShowPreviewModal(true);
  };

  const handleEdit = (question) => {
    console.log('Edit question:', question);
  };

  const handleDuplicate = (question) => {
    console.log('Duplicate question:', question);
  };

  const handleDelete = (question) => {
    console.log('Delete question:', question);
  };

  const handleBulkExport = () => {
    console.log('Export questions:', selectedQuestions);
  };

  const handleBulkImport = () => {
    console.log('Import questions');
  };

  const handleBulkDelete = () => {
    console.log('Delete questions:', selectedQuestions);
    setSelectedQuestions([]);
  };

  const handleBulkTag = (tag) => {
    console.log('Add tag to questions:', selectedQuestions, tag);
  };

  const handleSaveQuestion = (questionData) => {
    console.log('Save new question:', questionData);
  };

  const { logout } = useLogout();

  return (
    <div className="min-h-screen bg-background">
      <RoleBasedHeader
        userRole="teacher"
        onLogout={async () => { await logout(false); }}
      />
      <main className="pt-20 pb-12">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 lg:px-8">
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-heading font-bold text-foreground mb-2">
                  Question Bank Management
                </h1>
                <p className="text-sm md:text-base text-muted-foreground">
                  Organize, create, and maintain your assessment questions
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
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
                  onClick={() => setShowCreateModal(true)}
                >
                  Create Question
                </Button>
              </div>
            </div>

            <QuestionStatsCard stats={stats} />
          </div>

          {selectedQuestions?.length > 0 && (
            <div className="mb-6">
              <BulkOperationsBar
                selectedCount={selectedQuestions?.length}
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
              />
            </div>

            <div className="lg:col-span-3 space-y-6">
              <div className="bg-card border border-border rounded-lg shadow-md p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                      <Checkbox
                      checked={selectedQuestions?.length === (questions || [])?.length}
                      onChange={handleSelectAll}
                    />
                    <p className="text-sm font-medium text-foreground">
                      {(questions || [])?.length} questions found
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconName="Download"
                    iconPosition="left"
                    onClick={handleBulkExport}
                  >
                    Export All
                  </Button>
                </div>

                <div className="space-y-4">
                  {(questions || [])?.map((question) => (
                    <div key={question?.id} className="flex items-start space-x-3">
                      <div className="pt-6">
                        <Checkbox
                          checked={selectedQuestions?.includes(question?.id)}
                          onChange={() => handleSelectQuestion(question?.id)}
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
              </div>

              <div className="flex justify-center">
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" iconName="ChevronLeft">
                    Previous
                  </Button>
                  <div className="flex items-center space-x-1">
                    <button className="w-8 h-8 md:w-10 md:h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium">
                      1
                    </button>
                    <button className="w-8 h-8 md:w-10 md:h-10 rounded-md hover:bg-muted text-sm font-medium text-foreground transition-smooth">
                      2
                    </button>
                    <button className="w-8 h-8 md:w-10 md:h-10 rounded-md hover:bg-muted text-sm font-medium text-foreground transition-smooth">
                      3
                    </button>
                    <span className="text-muted-foreground px-2">...</span>
                    <button className="w-8 h-8 md:w-10 md:h-10 rounded-md hover:bg-muted text-sm font-medium text-foreground transition-smooth">
                      10
                    </button>
                  </div>
                  <Button variant="outline" size="sm" iconName="ChevronRight">
                    Next
                  </Button>
                </div>
              </div>
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
          onClose={() => setShowCreateModal(false)}
          onSave={handleSaveQuestion}
        />
      )}
    </div>
  );
};

export default QuestionBankManagement;
 
