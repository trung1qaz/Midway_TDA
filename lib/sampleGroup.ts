import type { Member } from "@/types/member";

// Demo group for the "Load sample group" button. Deliberately mixed input:
// a precise address, a "between", a "somewhere in [state]", and one with
// vague availability and budget. All locations are in the Midwest.
export const SAMPLE_GROUP: Omit<Member, "id">[] = [
  {
    name: "Maya",
    location: "233 S Wacker Dr, Chicago, IL 60606",
    availability: "Saturdays 10am to 4pm",
    budget: "under $40",
  },
  {
    name: "Jordan",
    location: "somewhere between Fort Wayne and Toledo",
    availability: "free after 6 on Fri",
    budget: "$25-30",
  },
  {
    name: "Priya",
    location: "somewhere in Ohio",
    availability: "weekday evenings",
    budget: "cheap",
  },
  {
    name: "Sam",
    location: "Champaign, IL",
    availability: "next Saturday, maybe Sunday too?",
    budget: "whatever works",
  },
];
