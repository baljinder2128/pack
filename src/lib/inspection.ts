import type { InspectionItem } from './types';

/** Daily heavy vehicle pre-start checks: the truck, then the trailer. */
export const CHECKLIST: { key: string; label: string; section: 'truck' | 'trailer' }[] = [
  { key: 'tyres', label: 'Tyres, wheels & nuts', section: 'truck' },
  { key: 'lights', label: 'Lights, indicators & reflectors', section: 'truck' },
  { key: 'brakes', label: 'Brakes & air system', section: 'truck' },
  { key: 'steering', label: 'Steering', section: 'truck' },
  { key: 'mirrors', label: 'Mirrors, windscreen & wipers', section: 'truck' },
  { key: 'fluids', label: 'Oil, coolant & fluid levels', section: 'truck' },
  { key: 'leaks', label: 'No oil, fuel or air leaks', section: 'truck' },
  { key: 'coupling', label: 'Fifth wheel, jaws & safety chains', section: 'truck' },
  { key: 'horn', label: 'Horn & warning devices', section: 'truck' },
  { key: 'safety', label: 'Fire extinguisher & first aid kit', section: 'truck' },
  { key: 'docs', label: 'Work diary, rego & permits on board', section: 'truck' },
  { key: 'cab', label: 'Cab clean, seatbelt working', section: 'truck' },
  { key: 't_kingpin', label: 'Kingpin & turntable locked, pin secure', section: 'trailer' },
  { key: 't_lines', label: 'Air lines (suzies) & electrical plug connected, no leaks', section: 'trailer' },
  { key: 't_tyres', label: 'Trailer tyres, wheels & nuts', section: 'trailer' },
  { key: 't_lights', label: 'Trailer lights, indicators & reflectors', section: 'trailer' },
  { key: 't_brakes', label: 'Trailer brakes & park brake', section: 'trailer' },
  { key: 't_suspension', label: 'Suspension & airbags', section: 'trailer' },
  { key: 't_legs', label: 'Landing legs up, handle stowed', section: 'trailer' },
  { key: 't_body', label: 'Body, curtains, doors & gates secure', section: 'trailer' },
  { key: 't_locks', label: 'Twist locks / container pins locked', section: 'trailer' },
  { key: 't_load', label: 'Load restraint, straps & gates', section: 'trailer' },
  { key: 't_guards', label: 'Mudflaps, guards & number plate', section: 'trailer' },
];

export function freshChecklist(): InspectionItem[] {
  return CHECKLIST.map((c) => ({ ...c, ok: true, note: '' }));
}
