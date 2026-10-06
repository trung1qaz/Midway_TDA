// Fixture "OpenStreetMap" for mock mode: a fixed list of Midwest places with
// approximate real coordinates. OSM ids are synthetic (osmType "mock"), so
// they never collide with or pretend to be real OSM objects.

export type MockPlaceType = "state" | "city" | "town" | "village" | "address";

export interface MockPlace {
  name: string;
  state: string; // two-letter code
  type: MockPlaceType;
  lat: number;
  lng: number;
  // Extra lowercase phrases that should match this place in a forward search.
  aliases?: string[];
}

export const STATE_NAMES: Record<string, string> = {
  IL: "Illinois",
  IN: "Indiana",
  OH: "Ohio",
  MI: "Michigan",
  WI: "Wisconsin",
};

export const MOCK_PLACES: MockPlace[] = [
  // States (forward search only; never returned by reverse lookups).
  { name: "Illinois", state: "IL", type: "state", lat: 40.0797, lng: -89.4337 },
  { name: "Indiana", state: "IN", type: "state", lat: 40.3271, lng: -86.1746 },
  { name: "Ohio", state: "OH", type: "state", lat: 40.2253, lng: -82.6881 },
  { name: "Michigan", state: "MI", type: "state", lat: 44.3148, lng: -85.6024 },

  // A precise address for the sample group.
  {
    name: "233 South Wacker Drive",
    state: "IL",
    type: "address",
    lat: 41.8789,
    lng: -87.6359,
    aliases: ["233 s wacker", "233 south wacker", "willis tower"],
  },

  // Cities
  { name: "Chicago", state: "IL", type: "city", lat: 41.8781, lng: -87.6298 },
  { name: "Indianapolis", state: "IN", type: "city", lat: 39.7684, lng: -86.1581, aliases: ["indy"] },
  { name: "Fort Wayne", state: "IN", type: "city", lat: 41.0793, lng: -85.1394 },
  { name: "Toledo", state: "OH", type: "city", lat: 41.6528, lng: -83.5379 },
  { name: "Columbus", state: "OH", type: "city", lat: 39.9612, lng: -82.9988 },
  { name: "Dayton", state: "OH", type: "city", lat: 39.7589, lng: -84.1916 },
  { name: "Champaign", state: "IL", type: "city", lat: 40.1164, lng: -88.2434 },
  { name: "Urbana", state: "IL", type: "city", lat: 40.1106, lng: -88.2073 },
  { name: "South Bend", state: "IN", type: "city", lat: 41.6764, lng: -86.252 },
  { name: "Lafayette", state: "IN", type: "city", lat: 40.4167, lng: -86.8753 },
  { name: "Bloomington", state: "IN", type: "city", lat: 39.1653, lng: -86.5264 },
  { name: "Muncie", state: "IN", type: "city", lat: 40.1934, lng: -85.3864 },
  { name: "Kokomo", state: "IN", type: "city", lat: 40.4864, lng: -86.1336 },
  { name: "Lima", state: "OH", type: "city", lat: 40.7426, lng: -84.1052 },
  { name: "Findlay", state: "OH", type: "city", lat: 41.0442, lng: -83.6499 },
  { name: "Gary", state: "IN", type: "city", lat: 41.5934, lng: -87.3464 },
  { name: "Joliet", state: "IL", type: "city", lat: 41.525, lng: -88.0817 },

  // Towns
  { name: "Marion", state: "IN", type: "town", lat: 40.5584, lng: -85.6591 },
  { name: "Wabash", state: "IN", type: "town", lat: 40.7978, lng: -85.8205 },
  { name: "Huntington", state: "IN", type: "town", lat: 40.8831, lng: -85.4975 },
  { name: "Peru", state: "IN", type: "town", lat: 40.7537, lng: -86.0689 },
  { name: "Logansport", state: "IN", type: "town", lat: 40.7545, lng: -86.3567 },
  { name: "Rochester", state: "IN", type: "town", lat: 41.0645, lng: -86.2158 },
  { name: "Warsaw", state: "IN", type: "town", lat: 41.2381, lng: -85.853 },
  { name: "Plymouth", state: "IN", type: "town", lat: 41.3436, lng: -86.3097 },
  { name: "Anderson", state: "IN", type: "town", lat: 40.1053, lng: -85.6803 },
  { name: "Bluffton", state: "IN", type: "town", lat: 40.7387, lng: -85.1716 },
  { name: "Hartford City", state: "IN", type: "town", lat: 40.4512, lng: -85.37 },
  { name: "Tipton", state: "IN", type: "town", lat: 40.282, lng: -86.0411 },
  { name: "Frankfort", state: "IN", type: "town", lat: 40.2795, lng: -86.5108 },
  { name: "Crawfordsville", state: "IN", type: "town", lat: 40.0412, lng: -86.8745 },
  { name: "Greencastle", state: "IN", type: "town", lat: 39.6445, lng: -86.8647 },
  { name: "Monticello", state: "IN", type: "town", lat: 40.7453, lng: -86.7647 },
  { name: "Rensselaer", state: "IN", type: "town", lat: 40.9367, lng: -87.1509 },
  { name: "Valparaiso", state: "IN", type: "town", lat: 41.4731, lng: -87.0611 },
  { name: "Goshen", state: "IN", type: "town", lat: 41.5823, lng: -85.8345 },
  { name: "Columbia City", state: "IN", type: "town", lat: 41.1573, lng: -85.4883 },
  { name: "Auburn", state: "IN", type: "town", lat: 41.367, lng: -85.0589 },
  { name: "Decatur", state: "IN", type: "town", lat: 40.8306, lng: -84.9372 },
  { name: "Portland", state: "IN", type: "town", lat: 40.4345, lng: -84.9777 },
  { name: "Richmond", state: "IN", type: "town", lat: 39.8289, lng: -84.8902 },
  { name: "Danville", state: "IL", type: "town", lat: 40.1245, lng: -87.63 },
  { name: "Kankakee", state: "IL", type: "town", lat: 41.12, lng: -87.8612 },
  { name: "Rantoul", state: "IL", type: "town", lat: 40.3084, lng: -88.1559 },
  { name: "Watseka", state: "IL", type: "town", lat: 40.7762, lng: -87.7364 },
  { name: "Defiance", state: "OH", type: "town", lat: 41.2845, lng: -84.3558 },
  { name: "Napoleon", state: "OH", type: "town", lat: 41.3923, lng: -84.1252 },
  { name: "Van Wert", state: "OH", type: "town", lat: 40.8695, lng: -84.5841 },
  { name: "Bowling Green", state: "OH", type: "town", lat: 41.3748, lng: -83.6513 },
  { name: "Bryan", state: "OH", type: "town", lat: 41.4748, lng: -84.5524 },
  { name: "Celina", state: "OH", type: "town", lat: 40.5489, lng: -84.5702 },
  { name: "Kenton", state: "OH", type: "town", lat: 40.647, lng: -83.6097 },
  { name: "Bellefontaine", state: "OH", type: "town", lat: 40.3612, lng: -83.7597 },
  { name: "Sidney", state: "OH", type: "town", lat: 40.2842, lng: -84.1555 },
  { name: "Marysville", state: "OH", type: "town", lat: 40.2364, lng: -83.3671 },
  { name: "Delaware", state: "OH", type: "town", lat: 40.2987, lng: -83.068 },
  { name: "Springfield", state: "OH", type: "town", lat: 39.9242, lng: -83.8088 },

  // Villages
  { name: "Fowler", state: "IN", type: "village", lat: 40.6167, lng: -87.3206 },
  { name: "Roanoke", state: "IN", type: "village", lat: 40.9625, lng: -85.3733 },
  { name: "North Manchester", state: "IN", type: "village", lat: 40.9989, lng: -85.7686 },
  { name: "Ada", state: "OH", type: "village", lat: 40.7695, lng: -83.8227 },
  { name: "Paxton", state: "IL", type: "village", lat: 40.4603, lng: -88.0953 },
];
