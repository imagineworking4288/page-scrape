/**
 * Enrichment Report Generator
 *
 * Generates detailed reports from enrichment results:
 * - Summary statistics
 * - Field-by-field breakdown
 * - Before/after comparisons
 * - Manual review queue
 * - Data quality metrics
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate a comprehensive enrichment report
 * @param {Object} enrichmentResult - Result from ProfileEnricher.enrichContacts()
 * @param {Object} options - Report options
 * @returns {Object} - Generated report
 */
function generateReport(enrichmentResult, options = {}) {
  const {
    contacts = [],
    stats = {},
    reviewQueue = [],
    errors = []
  } = enrichmentResult;

  const report = {
    generatedAt: new Date().toISOString(),
    summary: generateSummary(contacts, stats),
    fieldBreakdown: generateFieldBreakdown(contacts),
    dataQuality: calculateDataQuality(contacts),
    reviewQueue: formatReviewQueue(reviewQueue),
    errors: formatErrors(errors),
    recommendations: generateRecommendations(contacts, stats)
  };

  return report;
}

/**
 * Generate summary statistics
 */
function generateSummary(contacts, stats) {
  const totalContacts = contacts.length;
  const enrichedContacts = contacts.filter(c => c._enrichment).length;

  // Count actions across all contacts
  const actionCounts = {
    ENRICHED: 0,
    VALIDATED: 0,
    CLEANED: 0,
    REPLACED: 0,
    UNCHANGED: 0,
    BOTH_MISSING: 0
  };

  contacts.forEach(contact => {
    if (contact._enrichment && contact._enrichment.actions) {
      Object.entries(contact._enrichment.actions).forEach(([action, count]) => {
        actionCounts[action] = (actionCounts[action] || 0) + count;
      });
    }
  });

  // Calculate percentages
  const totalActions = Object.values(actionCounts).reduce((a, b) => a + b, 0);

  return {
    totalContacts,
    enrichedContacts,
    enrichmentRate: totalContacts > 0 ? (enrichedContacts / totalContacts * 100).toFixed(1) + '%' : '0%',
    actionCounts,
    actionPercentages: Object.fromEntries(
      Object.entries(actionCounts).map(([action, count]) => [
        action,
        totalActions > 0 ? (count / totalActions * 100).toFixed(1) + '%' : '0%'
      ])
    ),
    processingStats: stats
  };
}

/**
 * Generate field-by-field breakdown
 */
function generateFieldBreakdown(contacts) {
  const fields = ['name', 'email', 'phone', 'location', 'title'];
  const breakdown = {};

  fields.forEach(field => {
    breakdown[field] = {
      original: { present: 0, missing: 0, contaminated: 0 },
      enriched: { present: 0, missing: 0 },
      actions: { ENRICHED: 0, VALIDATED: 0, CLEANED: 0, REPLACED: 0, UNCHANGED: 0 }
    };
  });

  contacts.forEach(contact => {
    fields.forEach(field => {
      // Check original state
      const originalValue = contact._original && contact._original[field];
      const currentValue = contact[field];

      if (originalValue) {
        breakdown[field].original.present++;
        // Check if it was contaminated (has _original different from current)
        if (currentValue !== originalValue && contact._enrichment) {
          breakdown[field].original.contaminated++;
        }
      } else if (!currentValue) {
        breakdown[field].original.missing++;
      }

      // Check enriched state
      if (currentValue) {
        breakdown[field].enriched.present++;
      } else {
        breakdown[field].enriched.missing++;
      }
    });

    // Count actions per field (from comparisons)
    if (contact._enrichment && contact._enrichment.comparisons) {
      Object.entries(contact._enrichment.comparisons).forEach(([field, comparison]) => {
        if (breakdown[field] && comparison.action) {
          breakdown[field].actions[comparison.action] =
            (breakdown[field].actions[comparison.action] || 0) + 1;
        }
      });
    }
  });

  // Calculate fill rates
  const totalContacts = contacts.length;
  fields.forEach(field => {
    breakdown[field].originalFillRate = totalContacts > 0
      ? (breakdown[field].original.present / totalContacts * 100).toFixed(1) + '%'
      : '0%';
    breakdown[field].enrichedFillRate = totalContacts > 0
      ? (breakdown[field].enriched.present / totalContacts * 100).toFixed(1) + '%'
      : '0%';
    breakdown[field].improvement = totalContacts > 0
      ? ((breakdown[field].enriched.present - breakdown[field].original.present) / totalContacts * 100).toFixed(1) + '%'
      : '0%';
  });

  return breakdown;
}

/**
 * Calculate overall data quality metrics
 */
function calculateDataQuality(contacts) {
  const totalContacts = contacts.length;
  if (totalContacts === 0) {
    return {
      overallScore: 0,
      completeness: 0,
      confidence: 'none',
      issues: []
    };
  }

  // Count field presence
  const fieldCounts = {
    name: 0,
    email: 0,
    phone: 0,
    location: 0,
    title: 0
  };

  const confidenceCounts = {
    high: 0,
    medium: 0,
    low: 0
  };

  const issues = [];

  contacts.forEach(contact => {
    Object.keys(fieldCounts).forEach(field => {
      if (contact[field]) fieldCounts[field]++;
    });

    if (contact._enrichment && contact._enrichment.confidence) {
      confidenceCounts[contact._enrichment.confidence] =
        (confidenceCounts[contact._enrichment.confidence] || 0) + 1;
    }

    // Check for issues
    if (contact._enrichment && contact._enrichment.needsReview) {
      issues.push({
        contact: contact.name || 'Unknown',
        reason: contact._enrichment.flags ? contact._enrichment.flags.join(', ') : 'needs review'
      });
    }
  });

  // Calculate completeness (weighted by field importance)
  const weights = { name: 0.3, email: 0.3, phone: 0.2, location: 0.1, title: 0.1 };
  let completeness = 0;
  Object.entries(fieldCounts).forEach(([field, count]) => {
    completeness += (count / totalContacts) * (weights[field] || 0.1);
  });

  // Determine overall confidence
  let overallConfidence = 'high';
  if (confidenceCounts.low > confidenceCounts.high) {
    overallConfidence = 'low';
  } else if (confidenceCounts.medium > confidenceCounts.high) {
    overallConfidence = 'medium';
  }

  // Calculate overall score (0-100)
  const confidenceMultiplier = { high: 1, medium: 0.8, low: 0.6 };
  const overallScore = Math.round(completeness * 100 * (confidenceMultiplier[overallConfidence] || 0.7));

  return {
    overallScore,
    completeness: (completeness * 100).toFixed(1) + '%',
    confidence: overallConfidence,
    confidenceBreakdown: confidenceCounts,
    fieldPresence: Object.fromEntries(
      Object.entries(fieldCounts).map(([field, count]) => [
        field,
        (count / totalContacts * 100).toFixed(1) + '%'
      ])
    ),
    issueCount: issues.length,
    issues: issues.slice(0, 10) // First 10 issues
  };
}

/**
 * Format review queue for report
 */
function formatReviewQueue(reviewQueue) {
  return {
    count: reviewQueue.length,
    items: reviewQueue.map(item => ({
      contact: item.contact ? item.contact.name : 'Unknown',
      profileUrl: item.contact ? item.contact.profileUrl : null,
      reason: item.reason || 'Unknown',
      flags: item.flags || [],
      originalValues: item.originalValues || {},
      profileValues: item.profileValues || {}
    }))
  };
}

/**
 * Format errors for report
 */
function formatErrors(errors) {
  return {
    count: errors.length,
    byType: errors.reduce((acc, error) => {
      const type = error.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}),
    samples: errors.slice(0, 5).map(error => ({
      type: error.type,
      message: error.message,
      contact: error.contact ? error.contact.name : 'Unknown'
    }))
  };
}

/**
 * Generate recommendations based on results
 */
function generateRecommendations(contacts, stats) {
  const recommendations = [];

  // Check email fill rate
  const emailCount = contacts.filter(c => c.email).length;
  const emailRate = contacts.length > 0 ? emailCount / contacts.length : 0;
  if (emailRate < 0.5) {
    recommendations.push({
      priority: 'high',
      category: 'data-quality',
      message: `Only ${(emailRate * 100).toFixed(0)}% of contacts have emails. Consider reviewing profile extraction or checking for alternative email sources.`
    });
  }

  // Check for high replacement rate (data conflicts)
  const replacedCount = contacts.filter(c =>
    c._enrichment && c._enrichment.actions && c._enrichment.actions.REPLACED > 0
  ).length;
  if (replacedCount > contacts.length * 0.1) {
    recommendations.push({
      priority: 'medium',
      category: 'data-integrity',
      message: `${replacedCount} contacts had data replaced due to conflicts. Review the replaced items to ensure profile data is correct.`
    });
  }

  // Check for high error rate
  if (stats.errors && stats.errors > stats.processed * 0.1) {
    recommendations.push({
      priority: 'high',
      category: 'processing',
      message: `High error rate detected (${stats.errors} errors out of ${stats.processed} processed). Check network connectivity and profile page structure.`
    });
  }

  // Check for low confidence
  const lowConfidenceCount = contacts.filter(c =>
    c._enrichment && c._enrichment.confidence === 'low'
  ).length;
  if (lowConfidenceCount > contacts.length * 0.2) {
    recommendations.push({
      priority: 'medium',
      category: 'confidence',
      message: `${lowConfidenceCount} contacts have low confidence scores. Consider manual review of these contacts.`
    });
  }

  // Add success recommendation if things look good
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      category: 'success',
      message: 'Enrichment completed successfully with good data quality metrics.'
    });
  }

  return recommendations;
}

/**
 * Save report to file
 * @param {Object} report - Generated report
 * @param {string} outputPath - Output file path
 * @param {string} format - Output format ('json' or 'text')
 */
function saveReport(report, outputPath, format = 'json') {
  if (format === 'text') {
    const text = formatReportAsText(report);
    fs.writeFileSync(outputPath, text, 'utf8');
  } else {
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  }
}

/**
 * Format report as readable text
 */
function formatReportAsText(report) {
  const lines = [];
  const divider = '═'.repeat(70);
  const subDivider = '─'.repeat(70);

  lines.push(divider);
  lines.push('  ENRICHMENT REPORT');
  lines.push(`  Generated: ${report.generatedAt}`);
  lines.push(divider);
  lines.push('');

  // Summary
  lines.push('SUMMARY');
  lines.push(subDivider);
  lines.push(`  Total Contacts:     ${report.summary.totalContacts}`);
  lines.push(`  Enriched Contacts:  ${report.summary.enrichedContacts}`);
  lines.push(`  Enrichment Rate:    ${report.summary.enrichmentRate}`);
  lines.push('');
  lines.push('  Action Breakdown:');
  Object.entries(report.summary.actionCounts).forEach(([action, count]) => {
    lines.push(`    ${action.padEnd(15)} ${count.toString().padStart(5)}  (${report.summary.actionPercentages[action]})`);
  });
  lines.push('');

  // Data Quality
  lines.push('DATA QUALITY');
  lines.push(subDivider);
  lines.push(`  Overall Score:  ${report.dataQuality.overallScore}/100`);
  lines.push(`  Completeness:   ${report.dataQuality.completeness}`);
  lines.push(`  Confidence:     ${report.dataQuality.confidence}`);
  lines.push('');
  lines.push('  Field Presence:');
  Object.entries(report.dataQuality.fieldPresence).forEach(([field, rate]) => {
    lines.push(`    ${field.padEnd(10)} ${rate}`);
  });
  lines.push('');

  // Field Breakdown
  lines.push('FIELD BREAKDOWN');
  lines.push(subDivider);
  Object.entries(report.fieldBreakdown).forEach(([field, data]) => {
    lines.push(`  ${field.toUpperCase()}`);
    lines.push(`    Original fill rate:  ${data.originalFillRate}`);
    lines.push(`    Enriched fill rate:  ${data.enrichedFillRate}`);
    lines.push(`    Improvement:         ${data.improvement}`);
    lines.push('');
  });

  // Review Queue
  if (report.reviewQueue.count > 0) {
    lines.push('MANUAL REVIEW QUEUE');
    lines.push(subDivider);
    lines.push(`  Contacts requiring review: ${report.reviewQueue.count}`);
    lines.push('');
    report.reviewQueue.items.slice(0, 5).forEach((item, i) => {
      lines.push(`  ${i + 1}. ${item.contact}`);
      lines.push(`     Reason: ${item.reason}`);
      if (item.flags.length > 0) {
        lines.push(`     Flags: ${item.flags.join(', ')}`);
      }
    });
    if (report.reviewQueue.count > 5) {
      lines.push(`  ... and ${report.reviewQueue.count - 5} more`);
    }
    lines.push('');
  }

  // Errors
  if (report.errors.count > 0) {
    lines.push('ERRORS');
    lines.push(subDivider);
    lines.push(`  Total errors: ${report.errors.count}`);
    lines.push('  By type:');
    Object.entries(report.errors.byType).forEach(([type, count]) => {
      lines.push(`    ${type}: ${count}`);
    });
    lines.push('');
  }

  // Recommendations
  lines.push('RECOMMENDATIONS');
  lines.push(subDivider);
  report.recommendations.forEach((rec, i) => {
    const priorityIcon = rec.priority === 'high' ? '!' : rec.priority === 'medium' ? '~' : ' ';
    lines.push(`  [${priorityIcon}] ${rec.message}`);
  });
  lines.push('');

  lines.push(divider);

  return lines.join('\n');
}

/**
 * Print report to console
 */
function printReport(report) {
  console.log(formatReportAsText(report));
}

module.exports = {
  generateReport,
  saveReport,
  printReport,
  generateSummary,
  generateFieldBreakdown,
  calculateDataQuality,
  generateRecommendations
};
