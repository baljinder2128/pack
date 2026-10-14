import { Screen } from '@/components/ui';
import { RunsheetList } from '@/components/RunsheetList';

/** Fuel dockets, kept apart from the Trips work area (More > Fuel dockets). */
export default function FuelScreen() {
  return (
    <Screen>
      <RunsheetList kind="fuel" />
    </Screen>
  );
}
