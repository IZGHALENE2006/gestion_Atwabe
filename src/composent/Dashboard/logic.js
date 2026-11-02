  const Category = ["drinks", "drinks", "ele"];

  export function Percentage(categories) {
    if (!Array.isArray(categories) || categories.length === 0) return [];
    const counts = categories.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const total = categories.length;

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        percentage: Number(((count / total) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }

