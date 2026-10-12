import type { InspectionItem } from './types';

/** Daily heavy vehicle pre-start checks. */
export const CHECKLIST: { key: string; label: string }[] = [
  { key: 'tyres', label: 'Tyres, wheels & nuts' },
  { key: 'lights', label: 'Lights, indicators & reflectors' },
  { key: 'brakes', label: 'Brakes & air system' },
  { key: 'steering', label: 'Steering' },
  { key: 'mirrors', label: 'Mirrors, windscreen & wipers' },
  { key: 'fluids', label: 'Oil, coolant & fluid levels' },
  { key: 'leaks', label: 'No oil, fuel or air leaks' },
  { key: 'coupling', label: 'Coupling, fifth wheel & safety chains' },
  { key: 'load', label: 'Load restraint & straps' },
  { key: 'horn', label: 'Horn & warning devices' },
  { key: 'safety', label: 'Fire extinguisher & first aid kit' },
  { key: 'docs', label: 'Work diary, rego & permits on board' },
  { key: 'cab', label: 'Cab clean, seatbelt working' },
];

export function freshChecklist(): InspectionItem[] {
  return CHECKLIST.map((c) => ({ ...c, ok: true, note: '' }));
}
