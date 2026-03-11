import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SimulationData {
  id: string;
  roomSafetyIndex: {
    score: number;
    grade: string;
    breakdown: {
      critical: number;
      serious: number;
      moderate: number;
      minor: number;
    };
  };
  heatmap: any[];
  config?: {
    ageGroup: string;
    duration: number;
  };
  stats?: {
    totalEvents: number;
  };
}

export const generateSafetyReport = (data: SimulationData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // ── HEADER ──
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text("Child Safety Audit Report", 20, 20);
  
  doc.setFontSize(12);
  doc.setTextColor(203, 213, 225); // Slate-300
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 20, 30);
  
  // ── SUMMARY CARD ──
  const rsi = data.roomSafetyIndex;
  
  // Determine color based on grade
  let gradeColor = [34, 197, 94]; // Green (S/A)
  if (rsi.grade === 'B' || rsi.grade === 'C') gradeColor = [234, 179, 8]; // Yellow
  if (rsi.grade === 'F') gradeColor = [239, 68, 68]; // Red
  
  doc.setDrawColor(gradeColor[0], gradeColor[1], gradeColor[2]);
  doc.setLineWidth(1.5);
  doc.roundedRect(20, 50, pageWidth - 40, 45, 3, 3, 'S');
  
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(16);
  doc.text("Safety Score", 30, 65);
  
  doc.setFontSize(36);
  doc.setTextColor(gradeColor[0], gradeColor[1], gradeColor[2]);
  doc.text(`${rsi.grade}`, 30, 80);
  
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text(`Score: ${rsi.score}/100`, 55, 78);
  
  // Stats column
  doc.setFontSize(11);
  doc.text(`Age Group: ${data.config?.ageGroup || 'Toddler (1-3y)'}`, 120, 65);
  doc.text(`Duration: ${data.config?.duration || 30} seconds`, 120, 72);
  doc.text(`Total Incidents: ${data.stats?.totalEvents || 0}`, 120, 79);
  
  // ── BREAKDOWN ──
  let yPos = 110;
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text("Risk Breakdown", 20, yPos);
  
  const riskData = [
    ['Risk Level', 'Count', 'Description'],
    ['Critical', rsi.breakdown.critical, 'Potential for severe injury/hospitalization'],
    ['Serious', rsi.breakdown.serious, 'Painful injury requiring medical attention'],
    ['Moderate', rsi.breakdown.moderate, 'Minor cuts/bruises'],
    ['Minor', rsi.breakdown.minor, 'Bump/scrape, no lasting harm'],
  ];
  
  autoTable(doc, {
    startY: yPos + 5,
    head: [riskData[0]],
    body: riskData.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [51, 65, 85] },
    styles: { fontSize: 10 },
  });
  
  // ── DANGEROUS OBJECTS TABLE ──
  yPos = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.text("Top Hazard Zones", 20, yPos);
  
  // Sory objects by danger
  const hazards = data.heatmap
    .filter(obj => obj.maxInjuryScore > 20)
    .sort((a, b) => b.maxInjuryScore - a.maxInjuryScore)
    .slice(0, 5)
    .map(obj => [
      obj.objectName,
      `${Math.round(obj.maxInjuryScore)}`,
      obj.collisions?.length || 0,
      obj.recommendations && obj.recommendations.length > 0 
        ? obj.recommendations[0].product 
        : 'Monitor Area'
    ]);
    
  if (hazards.length > 0) {
    autoTable(doc, {
      startY: yPos + 5,
      head: [['Object', 'Injury Max', 'Hits', 'Recommended Action']],
      body: hazards,
      theme: 'grid',
      headStyles: { fillColor: [185, 28, 28] }, // Red header
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("No significant hazards detected.", 20, yPos + 10);
  }

  // ── RECOMMENDATIONS ──
  yPos = (doc as any).lastAutoTable.finalY + 15;
  
  // Collect all unique recommendations
  const allRecs = new Map();
  if (data.heatmap && Array.isArray(data.heatmap)) {
    data.heatmap.forEach(obj => {
      if (obj.recommendations) {
        obj.recommendations.forEach((rec: any) => {
          if (!allRecs.has(rec.product)) {
            allRecs.set(rec.product, rec);
          }
        });
      }
    });
  }
  
  if (allRecs.size > 0) {
    // Check page break
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Safety Recommendations", 20, yPos);
    
    yPos += 10;
    doc.setFontSize(10);
    
    allRecs.forEach((rec) => {
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`• ${rec.product}`, 25, yPos);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`  Reason: ${rec.reason}`, 25, yPos + 5);
      
      doc.setTextColor(37, 99, 235); // Blue link
      doc.textWithLink('  Search Product', 25, yPos + 10, { url: rec.searchUrl });
      
      yPos += 18;
      
      // Auto page break for list
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
    });
  }

  // Save the PDF
  doc.save(`SafetyAudit_${new Date().toISOString().split('T')[0]}.pdf`);
};
