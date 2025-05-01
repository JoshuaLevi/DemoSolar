import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../styles/Chatbot.css';

// Helper to render confirmation details
const ConfirmationDetails = ({ details }) => (
  <div className="confirmation-details">
    {details.name && <div className="detail-item"><span className="detail-label">Name:</span> {details.name}</div>}
    {details.phone && <div className="detail-item"><span className="detail-label">Phone:</span> {details.phone}</div>}
    {details.email && <div className="detail-item"><span className="detail-label">Email:</span> {details.email}</div>}
    {details.type && <div className="detail-item"><span className="detail-label">Type:</span> {details.type}</div>}
    {details.address && <div className="detail-item"><span className="detail-label">Address:</span> {details.address}</div>}
    {details.reason && <div className="detail-item"><span className="detail-label">Reason:</span> {details.reason}</div>}
    {details.time && <div className="detail-item"><span className="detail-label">Time:</span> {details.time}</div>}
  </div>
);

function Confirmation({ details, prompt, buttons, onAction }) {
  return (
    <div className="confirmation-box">
      <div className="confirmation-details">
        <h4>Appointment Details</h4>
        <div className="detail-row">
          <span className="detail-label">Name:</span>
          <span className="detail-value">{details.name}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Phone:</span>
          <span className="detail-value">{details.phone}</span>
        </div>
        {details.email && (
          <div className="detail-row">
            <span className="detail-label">Email:</span>
            <span className="detail-value">{details.email}</span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-label">Type:</span>
          <span className="detail-value">{details.type}</span>
        </div>
        {details.address && (
          <div className="detail-row">
            <span className="detail-label">Address:</span>
            <span className="detail-value">{details.address}</span>
          </div>
        )}
        {details.reason && (
          <div className="detail-row">
            <span className="detail-label">Reason:</span>
            <span className="detail-value">{details.reason}</span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-label">Time:</span>
          <span className="detail-value">{details.time}</span>
        </div>
      </div>
      <p className="confirmation-prompt">{prompt}</p>
      <div className="confirmation-buttons">
        {buttons.map((button, i) => (
          <button 
            key={i} 
            className="confirmation-button"
            onClick={() => onAction(button.toLowerCase())}
          >
            {button}
          </button>
        ))}
      </div>
    </div>
  );
}

// Add a feedback component to show confidence and collect feedback
const ResponseFeedback = ({ confidence, reasoning, feedbackOptions, onFeedback }) => {
  // Format confidence as percentage
  const confidencePercent = confidence !== undefined 
    ? `${Math.round(confidence * 100)}%` 
    : null;

  return (
    <div className="response-feedback">
      {confidence !== undefined && (
        <div className="confidence-indicator">
          <div className="confidence-label">AI Confidence:</div>
          <div className="confidence-meter">
            <div 
              className="confidence-fill" 
              style={{ 
                width: `${Math.round(confidence * 100)}%`,
                backgroundColor: confidence > 0.8 ? '#4CAF50' : confidence > 0.5 ? '#FFC107' : '#F44336'
              }}
            ></div>
          </div>
          <div className="confidence-value">{confidencePercent}</div>
        </div>
      )}
      
      {reasoning && (
        <div className="reasoning">
          <span className="reasoning-icon">ℹ️</span>
          <span className="reasoning-text">{reasoning}</span>
        </div>
      )}
      
      {feedbackOptions && feedbackOptions.showOptions && (
        <div className="feedback-options">
          <div className="feedback-label">Was this response helpful?</div>
          <div className="feedback-buttons">
            {feedbackOptions.options.map(option => (
              <button 
                key={option.id}
                className="feedback-button"
                onClick={() => onFeedback(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi there! I\'m your DemoSolar assistant. How can I help you today? To save your quotes and appointments, I\'ll need your email, but you can skip that for now.', type: 'text', data: {} }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [isEmailSet, setIsEmailSet] = useState(false);
  const [emailSkipped, setEmailSkipped] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // --- State for Confirmation Editing --- START
  const [editingConfirmationIndex, setEditingConfirmationIndex] = useState(null);
  const [editedDetails, setEditedDetails] = useState({});
  // --- State for Confirmation Editing --- END

  // Auto-scroll to bottom of messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Effect for handling external trigger for starting intake process
  useEffect(() => {
    const handleIntakeProcess = (event) => {
      if (!isOpen) {
        setIsOpen(true);
      }
      
      // Add a slight delay to ensure the chat is open
      setTimeout(() => {
        const message = event.detail.message;
        if (message && typeof message === 'string') {
          setInput(message);
          // Submit the message automatically
          handleSubmit({ preventDefault: () => {} });
        }
      }, 300);
    };

    // Listen for the custom event
    document.addEventListener('startIntakeProcess', handleIntakeProcess);

    // Cleanup
    return () => {
      document.removeEventListener('startIntakeProcess', handleIntakeProcess);
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus on input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const skipEmail = () => {
    setEmailSkipped(true);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: 'No problem! You can continue without providing an email. How can I help you with solar energy today?', type: 'text', data: {} }
    ]);
  };

  // --- Modified sendMessage Function --- START
  const sendMessage = useCallback(async (messageToSend) => {
    setLoading(true);
    // Determine if sending text or object
    const isObjectMessage = typeof messageToSend !== 'string';
    const messageContent = isObjectMessage ? 'Updating details...' : messageToSend;

    // Add user message visually only if it's a text message
    if (!isObjectMessage) {
       setMessages(prev => [...prev, { role: 'user', content: messageContent }]);
    }
    setInput(''); // Clear input regardless

    try {
      // Prepare request data
      const requestPayload = isObjectMessage ? messageToSend : {
        message: messageContent,
        userEmail: email || 'anonymous',
        ...(conversationId && { conversationId: conversationId })
      };

      // Send the message to the backend
      const response = await axios.post('/api/ask', requestPayload, {
        headers: {
          'Content-Type': 'application/json' // Ensure correct header
        }
      });
      
      // Add the assistant response to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.data.text,
        type: response.data.type,
        data: response.data.data,
        confidence: response.data.confidence,
        reasoning: response.data.reasoning
      }]);

      // Store the conversationId from the response if not set
      if (!conversationId && response.data.data?.conversationId) {
        setConversationId(response.data.data.conversationId);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again later.',
        type: 'text',
        data: {}
      }]);
    } finally {
      setLoading(false);
    }
  }, [email, conversationId]); // Dependencies for useCallback
  // --- Modified sendMessage Function --- END

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // Handle email logic first
    if (!isEmailSet && !emailSkipped) {
       const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
       if (emailRegex.test(input.trim())) {
         setEmail(input.trim());
         setIsEmailSet(true);
         const userMessage = input;
         const assistantMessage = `Thanks for providing your email: ${input.trim()}. How can I help you today?`;
         setMessages(prev => [
           ...prev, 
           { role: 'user', content: userMessage },
           { role: 'assistant', content: assistantMessage, type: 'text', data: {} }
         ]);
         setInput('');
         return;
       } else {
         const userMessage = input;
         const assistantMessage = 'To better assist you and save your information, could you please provide your email address? Or you can click "Skip" to continue without an email.';
         setMessages(prev => [
           ...prev, 
           { role: 'user', content: userMessage },
           { role: 'assistant', content: assistantMessage, type: 'text', data: {} }
         ]);
         setInput('');
         return;
       }
    }
    
    // Send the regular text message
    sendMessage(input);
  };

  // --- Confirmation Handlers --- START
  const handleConfirmationAction = (action) => {
    sendMessage(action.toLowerCase()); // Send 'yes' or 'no'
  };

  const handleEditClick = (index, details) => {
    setEditingConfirmationIndex(index);
    setEditedDetails({ ...details }); // Clone details for editing
  };

  const handleCancelEdit = () => {
    setEditingConfirmationIndex(null);
    setEditedDetails({});
  };

  const handleSaveEdit = () => {
    const updatePayload = {
      type: 'crm_update',
      payload: editedDetails,
      // Include conversationId and email if needed by backend (check API design)
      userEmail: email || 'anonymous',
      conversationId: conversationId
    };
    sendMessage(updatePayload);
    setEditingConfirmationIndex(null); // Exit edit mode after sending
    setEditedDetails({});
  };

  const handleDetailChange = (field, value) => {
    setEditedDetails(prev => ({ ...prev, [field]: value }));
  };
  // --- Confirmation Handlers --- END

  // Add feedback handler
  const handleFeedback = useCallback(async (messageIndex, feedbackType) => {
    // In a real app, this would send the feedback to the server
    console.log(`Feedback for message ${messageIndex}: ${feedbackType}`);
    
    const message = messages[messageIndex];
    const previousUserMessage = messages[messageIndex - 1]; // Assuming user message always precedes assistant message

    if (!message || message.role !== 'assistant' || !previousUserMessage || previousUserMessage.role !== 'user') {
      console.error("Could not find relevant messages for feedback submission.");
      return; // Prevent sending incomplete feedback
    }

    const feedbackPayload = {
      conversationId: message.data?.conversationId || conversationId, // Get conversationId from message data or state
      messageIndex: messageIndex,
      userQuery: previousUserMessage.content,
      agentResponse: message.content,
      feedbackType: feedbackType,
    };

    if (!feedbackPayload.conversationId) {
       console.error("Cannot submit feedback: Conversation ID is missing.");
       return;
    }

    try {
      setLoading(true); // Indicate activity
      await axios.post('/api/feedback', feedbackPayload);
      console.log("Feedback submitted successfully.");
      // Update the message UI immediately after successful submission
      setMessages(prevMessages => {
        const updatedMessages = [...prevMessages];
        if (updatedMessages[messageIndex] && updatedMessages[messageIndex].data) {
          updatedMessages[messageIndex] = {
            ...updatedMessages[messageIndex],
            data: {
              ...updatedMessages[messageIndex].data,
              feedbackOptions: {
                ...(updatedMessages[messageIndex].data.feedbackOptions || {}),
                showOptions: false,
                submitted: feedbackType
              }
            }
          };
        }
        return updatedMessages;
      });

    } catch (error) {
      console.error("Error submitting feedback:", error);
      // Optionally show an error to the user
    } finally {
       setLoading(false);
    }

  }, [messages, conversationId]); // Add messages and conversationId to dependencies

  // Format message content based on message type
  const formatMessage = (message, index) => {
    if (message.role === 'user') {
      return <p>{message.content}</p>;
    }
    
    // --- Handle Confirmation Type --- START
    if (message.type === 'confirmation') {
      const { details, prompt, buttons } = message.data || {};

      if (editingConfirmationIndex === index) {
        // Render Edit Form
        return (
          <div className="confirmation-edit-form">
            <p><strong>Edit Appointment Details:</strong></p>
            {Object.keys(editedDetails).map(key => {
              // Don't render input for undefined initial address in virtual appt
              if (key === 'address' && details.address === undefined) return null;
              return (
                 <div key={key} className="form-group-inline">
                   <label htmlFor={`edit-${key}-${index}`}>{key.charAt(0).toUpperCase() + key.slice(1)}:</label>
                   <input
                     type="text"
                     id={`edit-${key}-${index}`}
                     value={editedDetails[key] || ''} 
                     onChange={(e) => handleDetailChange(key, e.target.value)}
                     disabled={loading}
                   />
                 </div>
              )
             })}
            <div className="button-group">
              <button onClick={handleSaveEdit} disabled={loading} className="save-button">Save</button>
              <button onClick={handleCancelEdit} disabled={loading} className="cancel-button">Cancel</button>
            </div>
          </div>
        );
      } else {
        // Render Confirmation View
        return (
          <div className="confirmation-message">
            <p>{message.content || prompt}</p>
            {details && <ConfirmationDetails details={details} />}
            {buttons && (
              <div className="button-group">
                {buttons.map(btnText => (
                  <button
                    key={btnText}
                    onClick={() => btnText === 'Edit' ? handleEditClick(index, details) : handleConfirmationAction(btnText)}
                    disabled={loading}
                    className={`${btnText.toLowerCase()}-button`}
                  >
                    {btnText}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      }
    }
    // --- Handle Confirmation Type --- END

    // Assistant messages (non-confirmation)
    let formattedContent = message.content;
    // Basic Markdown to HTML conversion for offers and text
    if (message.type === 'offer' || message.type === 'text' || message.type === 'handoff') {
        // Convert headers first
        formattedContent = formattedContent.replace(/^# (.*$)/gim, '<h3>$1</h3>');
        formattedContent = formattedContent.replace(/^### (.*$)/gim, '<h4>$1</h4>');
        formattedContent = formattedContent.replace(/^## (.*$)/gim, '<h3>$1</h3>');
        // Convert bold text
        formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        // Preserve line breaks
        formattedContent = formattedContent.replace(/\n/g, '<br />');
        // Remove any remaining hash symbols that might have been missed
        formattedContent = formattedContent.replace(/#{1,3}\s+/g, '<b>');
        formattedContent = formattedContent.replace(/#{1,3}$/g, '</b>');
    }
    
    if (message.type === 'offer' || (message.type === 'handoff' && message.content && message.content.includes('Solar System Proposal'))) {
      console.log("Received proposal message:", message);
      
      // If it's a handoff but contains proposal content, override the type
      if (message.type === 'handoff' && message.content.includes('Solar System Proposal')) {
        console.log("Converting handoff message to offer type for styling");
        message.type = 'offer';
      }
      
      // Simple preprocessing to ensure # is properly formatted with spaces
      if (message.content) {
        // Basic preprocessing to normalize formatting
        let processedContent = message.content;
        processedContent = processedContent.replace(/#Solar/g, "# Solar");
        processedContent = processedContent.replace(/###System/g, "### System");
        processedContent = processedContent.replace(/###Financing/g, "### Financing");
        processedContent = processedContent.replace(/###Environmental/g, "### Environmental");
        
        // Update content with fixed formatting
        message.content = processedContent;
      }
      
      // Format offer messages into a more structured layout
      if (message.content) {
        // Check if this is a proposal based on broad patterns
        const isProposal = true; // Assume all offer messages are proposals
        
        if (isProposal) {
          console.log("Processing proposal message:", message.content);
          
          // Extract introduction paragraph and title
          let title = 'Solar System Proposal';
          let intro = '';
          
          // Try to extract title from markdown heading
          const titleMatch = message.content.match(/# ([^\n]+)/);
          if (titleMatch) {
            title = titleMatch[1];
            intro = message.content.split(/###\s+System Details/i)[0]
              .replace(/# [^\n]+\n\n/, '')
              .trim();
          } else {
            // Alternate extraction if no markdown heading
            intro = message.content.split(/System Details/i)[0].trim();
          }
          
          // Create custom HTML structure for the entire proposal
          const createProposalHtml = () => {
            // Extract sections
            const sections = {};
            
            // System Details section
            const systemDetailsMatch = message.content.match(/System Details.*?\n([\s\S]*?)(?=Financing|Environmental|Note:|Would you|$)/is);
            if (systemDetailsMatch) {
              sections.systemDetails = systemDetailsMatch[1].trim();
            }
            
            // Financing Options section
            const financingMatch = message.content.match(/Financing Options.*?\n([\s\S]*?)(?=Environmental|Note:|Would you|$)/is);
            if (financingMatch) {
              sections.financing = financingMatch[1].trim();
            }
            
            // Environmental Impact section
            const envMatch = message.content.match(/Environmental Impact.*?\n([\s\S]*?)(?=Note:|Would you|$)/is);
            if (envMatch) {
              sections.environmental = envMatch[1].trim();
            }
            
            // Extract final notes
            const noteMatch = message.content.match(/Note:(.*?)(?=Would you|$)/is);
            if (noteMatch) {
              sections.note = noteMatch[1].trim();
            }
            
            // Extract final question
            const questionMatch = message.content.match(/Would you like(.*?)$/is);
            if (questionMatch) {
              sections.question = `Would you like${questionMatch[1].trim()}`;
            }
            
            // Start building the HTML
            let html = `
              <div class="proposal-cards">
                <div class="assessment-plan system-details">
                  <h4>System Details</h4>
                  ${parseDetails(sections.systemDetails)}
                </div>
            `;
            
            // Add financing options
            if (sections.financing) {
              const financingOptionsHtml = parseFinancingOptions(sections.financing);
              html += `
                <div class="financing-options">
                  <h4>Financing Options</h4>
                  ${financingOptionsHtml}
                </div>
              `;
            }
            
            // Add environmental impact
            if (sections.environmental) {
              html += `
                <div class="assessment-plan environmental-impact">
                  <h4>Environmental Impact</h4>
                  ${parseDetails(sections.environmental)}
                </div>
              `;
            }
            
            // Close the cards div
            html += `</div>`;
            
            // Add notes and questions
            if (sections.note) {
              html += `<p class="proposal-note"><em>Note: ${sections.note}</em></p>`;
            }
            if (sections.question) {
              html += `<p class="proposal-question">${sections.question}</p>`;
            }
            
            return html;
          };
          
          // Helper function to parse details from text blocks
          const parseDetails = (text) => {
            if (!text) return '';
            
            return text.split('\n')
              .filter(line => line.trim() !== '')
              .map(line => {
                // Try to find key-value pairs with flexible pattern matching
                let key, value;
                const dashMatch = line.match(/^-\s*(.*?):\s*(.*)/);
                if (dashMatch) {
                  key = dashMatch[1].trim();
                  value = dashMatch[2].trim();
                } else {
                  // Try alternative pattern without dash
                  const altMatch = line.match(/(.*?):\s*(.*)/);
                  if (altMatch) {
                    key = altMatch[1].trim();
                    value = altMatch[2].trim();
                  } else {
                    return ''; // No key-value pattern found
                  }
                }
                
                return `
                  <div class="assessment-plan-detail">
                    <span class="label">${key}</span>
                    <span class="value">${value}</span>
                  </div>
                `;
              })
              .join('');
          };
          
          // Helper function to parse financing options
          const parseFinancingOptions = (text) => {
            if (!text) return '';
            
            // Extract options based on common patterns
            const optionBlocks = [];
            
            // Try to find Purchase option
            const purchaseMatch = text.match(/purchase[^*]*:([^*]+?)(?=loan|lease|$)/is);
            if (purchaseMatch) {
              optionBlocks.push({
                type: 'purchase',
                title: 'Purchase Option',
                content: purchaseMatch[1].trim()
              });
            }
            
            // Try to find Loan option
            const loanMatch = text.match(/loan[^*]*:([^*]+?)(?=purchase|lease|$)/is);
            if (loanMatch) {
              optionBlocks.push({
                type: 'loan',
                title: 'Loan Option',
                content: loanMatch[1].trim()
              });
            }
            
            // Try to find Lease option
            const leaseMatch = text.match(/lease[^*]*:([^*]+?)(?=purchase|loan|$)/is);
            if (leaseMatch) {
              optionBlocks.push({
                type: 'lease',
                title: 'Lease Option',
                content: leaseMatch[1].trim()
              });
            }
            
            // If no options were found with the above pattern, try a simpler approach
            if (optionBlocks.length === 0) {
              // Split by double asterisks or just look for key financing terms
              const terms = ['Purchase', 'Loan', 'Lease'];
              terms.forEach(term => {
                const regex = new RegExp(`\\*\\*${term}[^*]*\\*\\*:([^*]+?)(?=\\*\\*|$)`, 'is');
                const match = text.match(regex);
                if (match) {
                  optionBlocks.push({
                    type: term.toLowerCase(),
                    title: `${term} Option`,
                    content: match[1].trim()
                  });
                }
              });
            }
            
            // If still no options were found, use a very broad approach
            if (optionBlocks.length === 0) {
              console.log("Using fallback financing option parsing");
              if (text.includes('Purchase') || text.includes('purchase')) {
                optionBlocks.push({
                  type: 'purchase',
                  title: 'Purchase Option',
                  content: text 
                });
              }
            }
            
            // Format each option as a card
            return optionBlocks.map(option => {
              return `
                <div class="assessment-plan ${option.type}">
                  <h4>${option.title}</h4>
                  ${parseDetails(option.content)}
                </div>
              `;
            }).join('');
          };

          // Render the proposal with our custom styling
          return (
            <div className="assessment-message offer-message proposal-message">
              <h3 className="proposal-title">{title}</h3>
              <p>{intro}</p>
              <div dangerouslySetInnerHTML={{ __html: createProposalHtml() }} />
            </div>
          );
        }
      }
      
      // Default rendering for other offer messages
      return (
        <div className="offer-message">
          <div dangerouslySetInnerHTML={{ __html: formattedContent }} />
        </div>
      );
    }
    
    if (message.type === 'appointment') {
      return (
        <div className="appointment-message">
          <div dangerouslySetInnerHTML={{ __html: formattedContent }} />
        </div>
      );
    }
    
    // Format assessment messages into a more structured layout
    if (message.content && message.content.includes('### Basic Plan') || 
        message.content.includes('### Standard Plan') || 
        message.content.includes('### Premium Plan')) {
      
      // Extract introduction paragraph
      let intro = message.content.split('###')[0].trim();
      
      // Create structured HTML for the plans
      const createPlanHtml = () => {
        // Parse out the different plans
        const planSections = message.content.match(/### (Basic|Standard|Premium) Plan[\s\S]*?(?=### |$)/g) || [];
        
        return planSections.map(plan => {
          const planType = plan.match(/### (Basic|Standard|Premium) Plan/)[1].toLowerCase();
          const planDetails = plan.replace(/### (Basic|Standard|Premium) Plan.*?\n/, '');
          
          // Extract key details using regex
          const panelsMatch = planDetails.match(/\*\*Number of Panels:\*\* (\d+)/);
          const sizeMatch = planDetails.match(/\*\*System Size:\*\* ([\d\.]+) kWp/);
          const productionMatch = planDetails.match(/\*\*Estimated Annual Production:\*\* ([\d,\.]+) kWh/);
          const usageMatch = planDetails.match(/\((\d+)% of your usage\)/);
          const costMatch = planDetails.match(/\*\*Estimated Cost:\*\* €([\d,\.]+)/);
          
          const panels = panelsMatch ? panelsMatch[1] : "N/A";
          const size = sizeMatch ? sizeMatch[1] : "N/A";
          const production = productionMatch ? productionMatch[1] : "N/A";
          const usage = usageMatch ? usageMatch[1] : "N/A";
          const cost = costMatch ? costMatch[1] : "N/A";
          
          return `
            <div class="assessment-plan ${planType}">
              <h4>${planType.charAt(0).toUpperCase() + planType.slice(1)} Plan (${usageMatch ? usageMatch[1] + '% Coverage' : ''})</h4>
              <div class="assessment-plan-detail">
                <span class="label">Panels:</span>
                <span class="value">${panels}</span>
              </div>
              <div class="assessment-plan-detail">
                <span class="label">System Size:</span>
                <span class="value">${size} kWp</span>
              </div>
              <div class="assessment-plan-detail">
                <span class="label">Annual Production:</span>
                <span class="value">${production} kWh (${usage}%)</span>
              </div>
              <div class="assessment-plan-detail">
                <span class="label">Estimated Cost:</span>
                <span class="value">€${cost}</span>
              </div>
            </div>
          `;
        }).join('');
      };

      return (
        <div className="assessment-message">
          <p>{intro}</p>
          <div dangerouslySetInnerHTML={{ __html: createPlanHtml() }} />
          <p>Which plan would you be interested in? Or would you like a custom proposal?</p>
        </div>
      );
    }

    // Add feedback component for text responses
    const showFeedback = message.type === 'text' && 
                         (message.confidence !== undefined ||
                          message.reasoning ||
                          // Explicitly check the showOptions flag
                          (message.data?.feedbackOptions?.showOptions === true));

    return (
      <div>
        <div dangerouslySetInnerHTML={{ __html: formattedContent }} />
        
        {showFeedback && (
          <ResponseFeedback 
            confidence={message.confidence}
            reasoning={message.reasoning}
            feedbackOptions={message.data && message.data.feedbackOptions}
            onFeedback={(feedbackType) => handleFeedback(index, feedbackType)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="chatbot-container">
      {/* Chat button */}
      <button 
        className={`chat-button ${isOpen ? 'open' : ''}`}
        onClick={toggleChat}
        aria-label="Toggle chat"
      >
        {isOpen ? '✕' : '💬'}
      </button>
      
      {/* Chat panel */}
      {isOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <h3>DemoSolar Assistant</h3>
          </div>
          
          <div className="messages-container">
            {messages.map((message, index) => (
              <div 
                key={index} 
                className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
              >
                {formatMessage(message, index)}
              </div>
            ))}
            {loading && (
              <div className="message assistant-message">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <form className="chat-input" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={!isEmailSet && !emailSkipped ? "Please enter your email..." : "Type your message..."}
              disabled={loading || editingConfirmationIndex !== null}
            />
            <div className="button-container">
              <button 
                type="submit" 
                disabled={loading || !input.trim() || editingConfirmationIndex !== null}
                className="send-button"
              >
              Send
            </button>
            {!isEmailSet && !emailSkipped && (
              <button 
                type="button" 
                className="skip-button"
                onClick={skipEmail}
                  disabled={loading}
              >
                Skip
              </button>
            )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Chatbot; 