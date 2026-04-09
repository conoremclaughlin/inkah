import { useStore } from 'effector-react';
import React from 'react';
import { setLearningService } from '../../event';
import { learningServiceStore } from '../../store';
import { t } from '../../../../../../src/dx-code-convenience/globals';

const services = [
  {
    label: 'Disable',
    value: '',
  },
  {
    label: 'LinguaLeo',
    value: 'lingualeo',
  },
  {
    label: 'Puzzle English',
    value: 'puzzle-english',
  },
];

function LearningService() {
  const currentService = useStore(learningServiceStore);

  function changeLearningService(service: string) {
    setLearningService(service);
  }

  return (
    <div className="inkahsubs-settings__learning-service inkahsubs-settings__item">
      <div className="inkahsubs-settings__item__left-side">
        <span>{t`Learning service`}</span>
      </div>
      <div className="inkahsubs-settings__item__right-side">
        <select
          className="inkahsubs-settings__select"
          value={currentService || ''}
          onChange={(e) => changeLearningService(e.target.value || null)}
        >
          {services.map((service: { value: string; label: string }, index) => {
            return (
              <option value={service.value} key={index}>
                {service.label}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
learningServiceStore.on(
  setLearningService,
  (state: any, service: object) => service
);

export default LearningService;
