export type TLEObject = {
  noradId: number;
  name: string;
  ownerCountry?: string;
  line1: string;
  line2: string;
  epoch: string;
  objectType: 'satellite' | 'debris' | 'unknown';
};

export type TLEResponse = {
  fetchedAt: string;
  staleAfter: string;
  stale?: boolean;
  error?: string;
  objects: TLEObject[];
};
