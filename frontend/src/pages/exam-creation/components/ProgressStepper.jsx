import React from 'react';
import Icon from '../../../components/AppIcon';

const ProgressStepper = ({ currentStep, steps, onStepClick }) => {
  return (
    <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-md mb-6">
      <div className="flex items-center justify-between">
        {steps?.map((step, index) => (
          <React.Fragment key={step?.id}>
            <div className="flex flex-col items-center flex-1">
              <button
                onClick={() => onStepClick(index)}
                disabled={index > currentStep}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-smooth mb-2 ${
                  index < currentStep
                    ? 'bg-success text-success-foreground'
                    : index === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                } ${index <= currentStep ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
              >
                {index < currentStep ? (
                  <Icon name="Check" size={24} />
                ) : (
                  <span className="text-lg font-semibold">{index + 1}</span>
                )}
              </button>
              <span className={`text-xs md:text-sm font-medium text-center ${
                index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {step?.label}
              </span>
            </div>
            {index < steps?.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 transition-smooth ${
                index < currentStep ? 'bg-success' : 'bg-muted'
              }`}></div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ProgressStepper;