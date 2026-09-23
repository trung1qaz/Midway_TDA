# Ethical Considerations

This is a living document. Most of the safeguards below belong to planned features, and each section notes how the current code relates to them.

## Privacy of personal data within the group

Midway asks members to share their location, schedule and budget with their group, so the design has to be careful about what is exposed and to whom. Budget and schedule details can carry personal weight. For example, a member might not be able to afford a spot, or might be unavailable more often than others. By default, Midway shares only what the group needs to make its decision, not the underlying personal details.

*Current state:* The input form stores member data only in the browser's `sessionStorage`, so nothing is sent to a server or persisted after the tab closes. The placeholder `/results` page shows each member's raw availability and budget. It is a development view, and the planned results experience will follow the minimal-sharing default above.

## Accuracy of AI-parsed input

The planned AI parser will interpret free-form input, so it could misread a location, availability or budget and produce a misleading recommendation. To reduce this risk, Midway will show a **confirmation step after parsing**, so each member can check how their input was interpreted before continuing.

*Current state:* The AI parser has not been built yet. Inputs are stored exactly as the member typed them.
