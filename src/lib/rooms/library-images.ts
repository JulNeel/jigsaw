export type LibraryImage = {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
};

export const LIBRARY_IMAGES: LibraryImage[] = [
  {
    id: "lille-grand-place",
    src: "/library/Lille_vue_gd_place_jigsaw.JPG",
    alt: "Vue de la Grand Place, Lille",
    width: 2639,
    height: 1799,
  },
  {
    id: "office-workstation",
    src: "/library/jbee_office_workstation_jigsaw.png",
    alt: "Poste de travail de bureau",
    width: 1587,
    height: 1123,
  },
];
