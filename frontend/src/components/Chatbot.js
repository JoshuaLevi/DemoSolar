import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../styles/Chatbot.css';

// Helper to render confirmation details
const ConfirmationDetails = ({ details }) => (
  <div className="confirmation-details">
    {details.name && <div><strong>Name:</strong> {details.name}</div>}
    {details.phone && <div><strong>Phone:</strong> {details.phone}</div>}
    {details.email && <div><strong>Email:</strong> {details.email}</div>}
    {details.type && <div><strong>Type:</strong> {details.type}</div>}
    {details.address && <div><strong>Address:</strong> {details.address}</div>}
    {details.reason && <div><strong>Reason:</strong> {details.reason}</div>}
    {details.time && <div><strong>Time:</strong> {details.time}</div>}
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

  // --- State for Confirmation Editing --- START
  const [editingConfirmationIndex, setEditingConfirmationIndex] = useState(null);
  const [editedDetails, setEditedDetails] = useState({});
  // --- State for Confirmation Editing --- END

  // Auto-scroll to bottom of messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        data: response.data.data
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
    if (message.type === 'offer' || message.type === 'text') {
        formattedContent = formattedContent.replace(/^### (.*$)/gim, '<h4>$1</h4>');
        formattedContent = formattedContent.replace(/^## (.*$)/gim, '<h3>$1</h3>');
        formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        formattedContent = formattedContent.replace(/\n/g, '<br />');
    }

    if (message.type === 'offer') {
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
    
    // Default for other types or plain text
    return <div dangerouslySetInnerHTML={{ __html: formattedContent }} />;
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
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={!isEmailSet && !emailSkipped ? "Please enter your email..." : "Type your message..."}
              disabled={loading || editingConfirmationIndex !== null}
            />
            <button type="submit" disabled={loading || !input.trim() || editingConfirmationIndex !== null}>
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
          </form>
        </div>
      )}
    </div>
  );
}

export default Chatbot; 