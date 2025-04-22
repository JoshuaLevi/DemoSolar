import { AgentResponse } from '../models/types';

// Static FAQ data
const faqData = [
  {
    question: 'What are solar panels?',
    answer: 'Solar panels are devices that convert sunlight into electricity. They are made up of photovoltaic cells that generate direct current (DC) electricity when exposed to sunlight.'
  },
  {
    question: 'How much do solar panels cost?',
    answer: 'The cost of solar panels varies depending on the size of the system, quality of panels, and installation complexity. On average, residential systems can range from $15,000 to $25,000 before incentives and tax credits.'
  },
  {
    question: 'How long do solar panels last?',
    answer: 'Most solar panels come with a 25-30 year warranty, but they can continue producing electricity for much longer. Their efficiency may decrease slightly over time, typically at a rate of about 0.5% per year.'
  },
  {
    question: 'What are the benefits of solar energy?',
    answer: 'Solar energy offers numerous benefits including reduced electricity bills, lower carbon footprint, increased property value, energy independence, and potential tax incentives or rebates.'
  },
  {
    question: 'Do solar panels work during winter or cloudy days?',
    answer: 'Yes, solar panels still generate electricity on cloudy days and during winter, although at reduced efficiency. They require light, not heat, to produce power, so they can still function in cold weather.'
  },
  {
    question: 'How long does installation take?',
    answer: 'The physical installation of a residential solar system typically takes 1-3 days, but the entire process from signing the contract to having an operational system can take 2-3 months due to permitting and utility approval processes.'
  },
  {
    question: 'What maintenance do solar panels require?',
    answer: 'Solar panels require minimal maintenance. Occasional cleaning to remove dirt and debris, and periodic inspections to ensure all components are functioning properly, are generally sufficient.'
  },
  {
    question: 'What happens if there is a power outage?',
    answer: 'Standard grid-tied solar systems will shut down during a power outage for safety reasons. If you want backup power, you would need to add a battery storage system or special inverters.'
  }
];

// Find the best match for a user query in our FAQ database
const findBestFAQMatch = (query: string): { answer: string, confidence: number } => {
  const lowerQuery = query.toLowerCase();
  let bestMatch = { answer: '', confidence: 0 };
  
  faqData.forEach(faq => {
    // Simple keyword matching for this prototype
    // In a real system, you would use a more sophisticated NLP approach
    const questionLower = faq.question.toLowerCase();
    const words = questionLower.split(' ');
    let matchCount = 0;
    
    words.forEach(word => {
      if (lowerQuery.includes(word) && word.length > 3) {
        matchCount++;
      }
    });
    
    const confidence = matchCount / words.length;
    
    if (confidence > bestMatch.confidence) {
      bestMatch = { answer: faq.answer, confidence };
    }
  });
  
  return bestMatch;
};

export const handleInfoQuery = async (message: string): Promise<AgentResponse> => {
  const { answer, confidence } = findBestFAQMatch(message);
  
  // If we don't have a good match, provide a generic response
  if (confidence < 0.2) {
    return {
      text: "I don't have specific information about that. Would you like to know about our solar panel installation services or schedule a consultation?",
      type: 'text'
    };
  }
  
  return {
    text: answer,
    type: 'text'
  };
}; 