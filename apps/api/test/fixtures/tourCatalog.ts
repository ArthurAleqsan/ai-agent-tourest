/**
 * Mock Tourest catalog exports for tests. Includes:
 *  - verified tours with price + booking URL + confirmed availability,
 *  - a tour with NO price and NO booking URL (missing data),
 *  - a tour in the wrong destination (Dubai),
 *  - a sold-out tour (must be excluded from matches).
 *
 * Columns mirror a realistic CSV export; availability is an embedded JSON cell.
 */
export const tourCatalogCsv = `external_id,title,destination,country,category,description,duration_hours,duration_label,languages,price_from,currency,url,availability
HRG-DIVE-1,Hurghada Scuba Diving Day Trip,Hurghada,Egypt,diving,Two guided dives in the Red Sea,6,,ru|en,55,USD,https://tourest.online/t/hrg-dive-1,"{""available"":true}"
HRG-SNORKEL-2,Giftun Island Snorkeling,Hurghada,Egypt,snorkeling,Boat trip to Giftun Island with snorkeling,8,Full day,ru|en,,,,
CAI-CITY-3,Cairo Pyramids Private Tour,Cairo,Egypt,city_tour,Giza pyramids and the museum,10,,en,70,USD,https://tourest.online/t/cai-city-3,"{""available"":true}"
DXB-DESERT-4,Dubai Desert Safari,Dubai,UAE,desert_safari,Dune bashing and BBQ dinner,5,,en,60,USD,https://tourest.online/t/dxb-desert-4,"{""available"":true}"
HRG-DIVE-SOLD-5,Hurghada Night Diving,Hurghada,Egypt,diving,Guided night dive,4,,en,80,USD,https://tourest.online/t/hrg-dive-5,"{""soldOut"":true}"
`;

export const tourCatalogJson = JSON.stringify({
  tours: [
    {
      externalId: "SSH-DIVE-10",
      title: "Sharm El Sheikh Reef Diving",
      destination: "Sharm El Sheikh",
      country: "Egypt",
      category: "diving",
      description: "Discover the Ras Mohammed reefs",
      durationHours: 7,
      languages: ["ru", "en"],
      priceFrom: 65,
      currency: "USD",
      url: "https://tourest.online/t/ssh-dive-10",
      availability: { available: true },
    },
  ],
});
