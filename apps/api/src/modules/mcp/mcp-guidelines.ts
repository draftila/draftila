const guidelines: Record<string, Record<string, unknown>> = {
  'landing-page': {
    topic: 'landing-page',
    layout: {
      structure:
        'Use a single-column layout with clear visual hierarchy. Hero section at top, followed by features, social proof, and CTA.',
      screenWidth: 'Design at 1440px wide. Content area should be 1200px max-width, centered.',
      spacing:
        'Use consistent vertical spacing between sections: 80-120px. Inner section padding: 40-60px.',
      grid: '12-column grid with 24px gutters.',
    },
    typography: {
      hero: 'Hero headline: 48-72px, bold (700-900). Keep under 8 words.',
      subheading: 'Subheading: 20-24px, regular weight (400). 1-2 sentences max.',
      body: 'Body text: 16-18px, line-height 1.5-1.7. Max 70 characters per line.',
      cta: 'CTA button text: 16-18px, bold. Use action verbs (Get Started, Try Free).',
    },
    color: {
      palette: 'Use 1 primary color, 1-2 accent colors, and neutrals. Max 5 total colors.',
      contrast: 'Ensure 4.5:1 contrast ratio for text on backgrounds.',
      cta: 'CTA buttons should use the primary brand color. Make them visually dominant.',
    },
    bestPractices: [
      'Above-the-fold content should communicate the core value proposition.',
      'Use whitespace generously to avoid visual clutter.',
      'Include only one primary CTA per section.',
      'Use real or realistic placeholder images, never empty image frames.',
      'Social proof (logos, testimonials, stats) builds trust — include it early.',
    ],
  },
  'mobile-app': {
    topic: 'mobile-app',
    layout: {
      screenSize: 'Design at 390x844px (iPhone 14). Use safe areas: 47px top, 34px bottom.',
      navigation: 'Bottom tab bar (49px height) for primary navigation. Max 5 tabs.',
      spacing: 'Use 16px horizontal padding. Vertical spacing between elements: 8-16px.',
      touchTargets: 'Minimum touch target size: 44x44px.',
    },
    typography: {
      title: 'Screen titles: 28-34px, bold.',
      body: 'Body text: 15-17px, regular. Line-height: 1.3-1.5.',
      caption: 'Captions and labels: 12-13px.',
      systemFont: 'Prefer system fonts (SF Pro for iOS, Roboto for Android) or Inter.',
    },
    color: {
      darkMode: 'Design for both light and dark modes.',
      backgrounds: 'Use system background colors. Light: #FFFFFF, Dark: #000000 or #1C1C1E.',
      accents: 'Keep accent colors consistent across the app. Max 2 accent colors.',
    },
    bestPractices: [
      'Prioritize one primary action per screen.',
      'Use native-feeling patterns (pull-to-refresh, swipe gestures).',
      'Keep text concise — mobile users scan, not read.',
      'Design thumb-reachable zones for key interactions.',
      'Use bottom sheets instead of modals where possible.',
    ],
  },
  'web-app': {
    topic: 'web-app',
    layout: {
      structure: 'Sidebar (240-280px) + main content area. Or top nav + content.',
      contentWidth: 'Main content area: 800-1200px. Full-width for dashboards.',
      spacing: 'Page padding: 24-32px. Card spacing: 16-24px.',
      responsive: 'Design for 1440px, 1024px, and 768px breakpoints.',
    },
    typography: {
      pageTitle: 'Page titles: 24-32px, semi-bold (600).',
      sectionTitle: 'Section titles: 18-20px, semi-bold.',
      body: 'Body text: 14-16px, regular (400). Line-height: 1.5.',
      labels: 'Form labels: 14px, medium (500). Input text: 14-16px.',
    },
    color: {
      neutral: 'Use a neutral palette for chrome (gray-50 to gray-900).',
      semantic: 'Success: green, Warning: amber, Error: red, Info: blue.',
      focus: 'Clearly visible focus rings for keyboard navigation.',
    },
    bestPractices: [
      'Use consistent component patterns from a design system.',
      'Make empty states helpful with clear actions.',
      'Show loading states for async operations.',
      'Error messages should be specific and actionable.',
      'Support keyboard navigation throughout.',
    ],
  },
  dashboard: {
    topic: 'dashboard',
    layout: {
      grid: 'Use a card-based grid layout. Cards should have consistent sizing.',
      hierarchy: 'Most important KPIs at the top. Charts and tables below.',
      density: 'Dashboards can be denser than other UIs. Use 12-16px spacing between cards.',
      sidebar: 'Left sidebar for navigation (56-240px). Collapsible on smaller screens.',
    },
    typography: {
      kpiValues: 'KPI values: 24-36px, bold. Use tabular numbers.',
      kpiLabels: 'KPI labels: 12-14px, medium weight, muted color.',
      chartLabels: 'Chart axis labels: 11-12px.',
    },
    color: {
      dataViz: 'Use a sequential or categorical color palette for charts. Max 6-8 distinct colors.',
      status: 'Green = positive/up, Red = negative/down, Gray = neutral.',
      cards: 'White cards on a light gray background (e.g., #F9FAFB).',
    },
    bestPractices: [
      'Lead with the most important metric.',
      'Use sparklines for trends, not just numbers.',
      'Provide time range selectors (today, 7d, 30d, 90d).',
      'Cards should be self-contained and scannable.',
      'Align chart axes and labels consistently.',
    ],
  },
  'design-system': {
    topic: 'design-system',
    components: {
      atoms: 'Buttons, inputs, labels, icons, badges, avatars.',
      molecules: 'Form fields (label+input+error), card headers, nav items.',
      organisms: 'Navigation bars, sidebars, forms, data tables, modals.',
    },
    spacing: {
      scale: 'Use a 4px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.',
      componentPadding: 'Small components: 8-12px. Medium: 12-16px. Large: 16-24px.',
    },
    naming: {
      convention: 'Use consistent naming: ComponentName/Variant/State.',
      states: 'Default, Hover, Focus, Active, Disabled.',
      variants: 'Primary, Secondary, Outline, Ghost, Destructive.',
    },
    bestPractices: [
      'Build small components first, compose into larger ones.',
      'Every component should have a clear default state.',
      'Use auto-layout frames for responsive components.',
      'Maintain consistent corner radii (e.g., 4px small, 8px medium, 12px large).',
      'Define and reuse a consistent color token system.',
    ],
  },
  typography: {
    topic: 'typography',
    scale: {
      modularScale:
        'Use a modular scale ratio (1.2 minor third, 1.25 major third, 1.333 perfect fourth).',
      sizes: 'Recommended scale: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72px.',
      lineHeight: 'Headings: 1.1-1.3. Body text: 1.4-1.6. Captions: 1.3-1.5.',
    },
    weights: {
      usage:
        'Regular (400) for body. Medium (500) for labels. Semi-bold (600) for subheadings. Bold (700) for headings.',
      limit: 'Use at most 3 weights in a design.',
    },
    pairing: {
      rule: 'Pair a serif with a sans-serif, or use one family with contrasting weights.',
      recommended: 'Inter + system serif, or a single variable font family.',
    },
    bestPractices: [
      'Max 2 font families per design.',
      'Maintain consistent line lengths (45-75 characters).',
      'Use sufficient line-height to improve readability.',
      'Left-align body text. Center-align only for short headings.',
      'Use letter-spacing sparingly — only for all-caps text (+0.05em).',
    ],
  },
  color: {
    topic: 'color',
    palette: {
      structure: 'Define a palette with: 1 primary, 1 secondary, 1 accent, plus neutrals.',
      neutrals: '9-10 shades of gray from near-white to near-black.',
      semantic: 'Success (green), Warning (amber/yellow), Error (red), Info (blue).',
    },
    usage: {
      backgrounds: 'Use the lightest neutrals for backgrounds.',
      text: 'Use the darkest neutrals for primary text. Medium for secondary text.',
      interactive: 'Primary color for interactive elements (links, buttons, focus rings).',
    },
    accessibility: {
      contrast: 'Text on background: minimum 4.5:1 (AA) for normal text, 3:1 for large text.',
      colorBlindness: "Don't rely solely on color to convey information. Use icons or labels.",
    },
    bestPractices: [
      'Use the 60-30-10 rule: 60% neutral, 30% secondary, 10% accent.',
      'Test your palette in both light and dark modes.',
      'Limit vibrant colors to interactive elements and key highlights.',
      'Use opacity/alpha variants for hover and disabled states.',
      'Ensure sufficient contrast for all text against its background.',
    ],
  },
  slides: {
    topic: 'slides',
    format: {
      aspectRatio: '16:9 at 1920x1080px.',
      margins: 'Keep content at least 100px from all edges.',
      density: 'One idea per slide. Slides are visual aids, not documents.',
    },
    typography: {
      titles: 'Slide titles: 80-200px, bold. Titles state the takeaway.',
      body: 'Body text: 36-80px. Short phrases, not sentences. No paragraphs.',
      minimum: 'Minimum font size: 28px. Never shrink fonts to fit - split the slide instead.',
      weights: 'Use weight contrast, not many sizes. Max 2 font families.',
      lineHeight: 'Line-height: 1.1-1.2 for slide text.',
    },
    color: {
      palette: '2-3 core colors plus neutrals. High contrast text/background mandatory.',
      accent: 'Accent colors only for emphasis. Body text should be neutral.',
      accessibility: 'Colorblind-safe palettes preferred.',
    },
    layouts: {
      cover:
        'Centered title (80-200px) + subtitle (36-48px). Emotional statement, not informational.',
      sectionBreak: 'Label (28px, muted) + title (48-56px). Maximum whitespace.',
      conceptVisual: '50/50 two-column: text on one side, visual on the other. Gap >= 40px.',
      kpis: 'Single KPI: number (120-200px) is hero, label (28px) is muted. 2-3 KPIs in equal columns.',
      list: 'Title (80px) + 3-5 items (28px). No wrapping, large gaps.',
      comparison: 'Two equal columns with heading (48-64px) + 2-4 bullet points (24px).',
      closing: 'Headline (48-56px) + sub (28px). Clean, final impression.',
    },
    bestPractices: [
      'One message per slide. If content overflows, split into multiple slides.',
      'Consistency > creativity. Reduce cognitive load across the deck.',
      'Use generous whitespace. Apply CRAP: Contrast, Repetition, Alignment, Proximity.',
      'Charts > text for data. One insight per chart. Simplify and highlight key datapoints.',
      'Opening and closing slides should be emotional statements, not informational.',
      'Text-only slides: let typography be the visual. Bold sizes, asymmetric layouts work well.',
    ],
  },
  layout: {
    topic: 'layout',
    principles: {
      alignment: 'Align elements to a consistent grid. Use left-alignment as the default.',
      proximity: 'Group related elements close together. Separate unrelated elements.',
      hierarchy: 'Establish clear visual hierarchy through size, weight, and color.',
      whitespace: 'Use generous whitespace. It improves readability and focus.',
    },
    grid: {
      columns: '12-column grid for web. 4-column for mobile.',
      gutters: '16-24px gutters for web. 16px for mobile.',
      margins: '24-80px page margins depending on screen size.',
    },
    autoLayout: {
      horizontal: 'Use horizontal auto-layout for button rows, nav items, tag lists.',
      vertical: 'Use vertical auto-layout for forms, card content, lists.',
      nesting: 'Nest auto-layout frames to create complex responsive layouts.',
      sizing: 'Use "fill" for flexible children, "hug" for content-sized, "fixed" for exact sizes.',
    },
    bestPractices: [
      'Use auto-layout (layoutMode) for all container frames.',
      'Consistent spacing is more important than specific values.',
      'Use frames with clip=true to create bounded sections.',
      'Align text baselines across columns.',
      'Use constraints for responsive designs within fixed-size frames.',
    ],
  },
};

export function getDesignGuidelines(topic: string): Record<string, unknown> {
  const guide = guidelines[topic];
  if (!guide) {
    return { error: `Unknown topic. Available: ${Object.keys(guidelines).join(', ')}` };
  }
  return guide;
}
