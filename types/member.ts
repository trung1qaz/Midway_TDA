export interface Member {
  // Stable id assigned when the form row is created. Everything downstream
  // (parser output, review edits, travel matrix rows) is keyed by it.
  id: string;
  name: string;
  location: string;
  availability: string;
  budget: string;
}
