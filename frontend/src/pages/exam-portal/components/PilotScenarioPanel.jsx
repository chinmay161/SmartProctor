import React, { useState } from 'react';
import flightRecorder from '../../../telemetry/flightRecorder';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { PILOT_SCENARIOS } from '../pilotScenarios';

const PilotScenarioPanel = () => {
  const [minimized, setMinimized] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [completedScenarios, setCompletedScenarios] = useState({});

  const handleStart = (scenario) => {
    setActiveScenarioId(scenario.id);
    // Scenario events must not suppress or change any violation behaviour
    flightRecorder.record('scenario', 'scenario_start', { scenario: scenario.name });
  };

  const handleDone = (scenario) => {
    setCompletedScenarios((prev) => ({ ...prev, [scenario.id]: true }));
    if (activeScenarioId === scenario.id) {
      setActiveScenarioId(null);
    }
    // Scenario events must not suppress or change any violation behaviour
    flightRecorder.record('scenario', 'scenario_end', { scenario: scenario.name });
  };

  const completedCount = Object.keys(completedScenarios).filter((k) => completedScenarios[k]).length;

  return (
    <div
      aria-label="Pilot Scenarios Checklist"
      className="fixed bottom-4 left-4 z-40 max-w-sm w-full bg-card/95 border border-primary/30 backdrop-blur-md rounded-xl shadow-xl overflow-hidden text-foreground text-xs"
    >
      <div
        className="px-3.5 py-2.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setMinimized(!minimized)}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
          <span className="font-semibold text-foreground">Pilot Tuning Mode</span>
          <span className="px-1.5 py-0.2 bg-primary/20 text-primary font-mono text-[10px] rounded">
            {completedCount}/{PILOT_SCENARIOS.length}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMinimized(!minimized);
          }}
          className="text-muted-foreground hover:text-foreground p-0.5"
          aria-label={minimized ? 'Expand panel' : 'Collapse panel'}
        >
          <Icon name={minimized ? 'ChevronUp' : 'ChevronDown'} size={16} />
        </button>
      </div>

      {!minimized && (
        <div className="p-3 max-h-72 overflow-y-auto space-y-2">
          <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
            Run each scripted test to tune violation detection models:
          </p>
          <div className="space-y-1.5">
            {PILOT_SCENARIOS.map((item) => {
              const isActive = activeScenarioId === item.id;
              const isDone = Boolean(completedScenarios[item.id]);

              return (
                <div
                  key={item.id}
                  className={`p-2 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                    isActive
                      ? 'bg-primary/15 border-primary/40'
                      : isDone
                      ? 'bg-muted/30 border-border/60 opacity-80'
                      : 'bg-muted/15 border-border'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="shrink-0">
                      {isDone ? (
                        <Icon name="CheckCircle2" size={14} className="text-success" />
                      ) : isActive ? (
                        <Icon name="PlayCircle" size={14} className="text-primary animate-pulse" />
                      ) : (
                        <Icon name="Circle" size={14} className="text-muted-foreground/50" />
                      )}
                    </div>
                    <span className={`truncate text-xs font-medium ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {item.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      size="xs"
                      variant={isActive ? 'secondary' : 'outline'}
                      onClick={() => handleStart(item)}
                      className="px-2 py-0.5 text-[11px] h-6"
                    >
                      Start
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant={isDone ? 'ghost' : 'primary'}
                      onClick={() => handleDone(item)}
                      className="px-2 py-0.5 text-[11px] h-6"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PilotScenarioPanel;
