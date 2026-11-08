import type { ChecklistConfiguration } from "../domain/checklist.types.js";

export const FREEDOM_DEFAULT_CHECKLIST_NAME = "Freedom Broker Chat Quality Checklist";
export const FREEDOM_DEFAULT_CHECKLIST_DESCRIPTION = "Original eight-criterion quality checklist for Freedom Broker customer conversations.";

export const freedomDefaultConfiguration: ChecklistConfiguration = {
  sections: [
    { id: "beginning", display_order: 1, name: "Beginning and Understanding the Request" },
    { id: "security", display_order: 2, name: "Security and Resolution" },
    { id: "dialogue", display_order: 3, name: "Dialogue Management and Closing" },
    { id: "violations", display_order: 4, name: "Severe Violations" }
  ],
  criteria: [
    {
      id: "freedom-criterion-01", code: "01", display_order: 1, section_id: "beginning",
      source_name: "Установление контакта", display_name: "Establishing Contact",
      description: "Оператор поздоровался на языке клиента и представился в первом ответе.",
      evaluation_instructions: "Да — оператор поздоровался на языке клиента и представился в первом ответе.",
      answer_type: "boolean", weight: 10, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true
    },
    {
      id: "freedom-criterion-02", code: "02", display_order: 2, section_id: "beginning",
      source_name: "Выявление потребности", display_name: "Identifying Customer Needs",
      description: "Оператор учёл известные детали и уточнил недостающее до ответа.",
      evaluation_instructions: "Да — оператор учёл известные детали и уточнил недостающее до ответа.",
      answer_type: "boolean", weight: 15, numeric_scale: [], na_enabled: true,
      na_rule: "Данных для ответа хватало с самого начала.", enabled: true
    },
    {
      id: "freedom-criterion-03", code: "03", display_order: 3, section_id: "security",
      source_name: "Идентификация", display_name: "Identity Verification",
      description: "Проверка личности подтверждена до раскрытия данных или защищённого действия.",
      evaluation_instructions: "Да — проверка личности подтверждена до раскрытия данных или защищённого действия.",
      answer_type: "boolean", weight: 20, numeric_scale: [], na_enabled: true,
      na_rule: "Запрос не требовал идентификации.", enabled: true
    },
    {
      id: "freedom-criterion-04", code: "04", display_order: 4, section_id: "security",
      source_name: "Корректная и полная консультация", display_name: "Correct and Complete Consultation",
      description: "Все существенные вопросы должны быть закрыты или должен быть дан корректный следующий шаг.",
      evaluation_instructions: "Оцените ответ или следующий шаг по указанной шкале.", answer_type: "numeric", weight: 20,
      numeric_scale: [
        { value: 0, description: "Ответа по существу нет или ключевая рекомендация ошибочна." },
        { value: 5, description: "Есть общая подсказка, но клиенту всё ещё непонятно, как действовать." },
        { value: 10, description: "Часть запроса закрыта, существенный вопрос остался открытым." },
        { value: 15, description: "Основной вопрос решён, пропущена второстепенная деталь." },
        { value: 20, description: "Все существенные вопросы закрыты или дан корректный следующий шаг." }
      ], na_enabled: true, na_rule: "Чат закончился до того, как клиент сформулировал запрос.", enabled: true
    },
    {
      id: "freedom-criterion-05", code: "05", display_order: 5, section_id: "dialogue",
      source_name: "Эмпатия и клиентоориентированность", display_name: "Empathy and Customer Orientation",
      description: "Оператор вежлив и, если клиент выразил недовольство или описал неудобство, отреагировал на конкретную проблему.",
      evaluation_instructions: "Да — оператор вежлив и, если клиент выразил недовольство или описал неудобство, отреагировал на конкретную проблему.",
      answer_type: "boolean", weight: 15, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true
    },
    {
      id: "freedom-criterion-06", code: "06", display_order: 6, section_id: "dialogue",
      source_name: "Управление диалогом, скорость и грамотность", display_name: "Dialogue Management, Speed and Clarity",
      description: "Оцените ясность, порядок ответов и предупреждение об ожидании.",
      evaluation_instructions: "Оцените ясность, порядок ответов и предупреждение об ожидании по указанной шкале.", answer_type: "numeric", weight: 15,
      numeric_scale: [
        { value: 0, description: "Из-за бессвязных или противоречивых реплик ход диалога непонятен." },
        { value: 4, description: "Клиенту приходится переспрашивать из-за формулировок или порядка ответов." },
        { value: 7, description: "Один заметный сбой, но клиент может понять ответ и продолжить." },
        { value: 10, description: "Ответы ясные и связные. Если было явное ожидание, оператор предупредил." }
      ], na_enabled: false, na_rule: "", enabled: true
    },
    {
      id: "freedom-criterion-07", code: "07", display_order: 7, section_id: "dialogue",
      source_name: "Завершение", display_name: "Conversation Closing",
      description: "Оператор подвёл итог или предложил дальнейшую помощь и попрощался.",
      evaluation_instructions: "Да — оператор подвёл итог или предложил дальнейшую помощь и попрощался.",
      answer_type: "boolean", weight: 5, numeric_scale: [], na_enabled: true,
      na_rule: "Чат оборвался до возможности его завершить.", enabled: true
    },
    {
      id: "freedom-criterion-08", code: "08", display_order: 8, section_id: "violations",
      source_name: "Грубые ошибки", display_name: "Severe Violations",
      description: "Оскорбление клиента, предложение платной услуги в обход компании или раскрытие конфиденциальной информации.",
      evaluation_instructions: "Да — выявлено оскорбление клиента, предложение платной услуги в обход компании или раскрытие конфиденциальной информации. Нет — ни одно из трёх не выявлено.",
      answer_type: "flag", weight: 0, numeric_scale: [], na_enabled: false, na_rule: "", enabled: true
    }
  ]
};
