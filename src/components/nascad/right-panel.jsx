import {
  Accordion,
} from '@/components/ui/accordion';

export default function RightPanel() {
  return (
    <aside className="w-80 border-l border-border bg-card overflow-y-auto">
      <Accordion type="multiple" defaultValue={[]} className="w-full">
        {/* All items have been removed as per the user's request. */}
      </Accordion>
    </aside>
  );
}