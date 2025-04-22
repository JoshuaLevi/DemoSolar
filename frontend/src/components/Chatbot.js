import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import '../styles/Chatbot.css';

function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi there! I\'m your DemoSolar assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [isEmailSet, setIsEmailSet] = useState(false);
  const messagesEndRef = useRef(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    // If email is not set, check if the current message is an email
    if (!isEmailSet) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (emailRegex.test(input.trim())) {
        setEmail(input.trim());
        setIsEmailSet(true);
        setMessages(prev => [
          ...prev, 
          { role: 'user', content: input },
          { role: 'assistant', content: `Thanks for providing your email: ${input.trim()}. How can I help you today?` }
        ]);
        setInput('');
        return;
      } else {
        // Ask for email if not set and this message isn't an email
        setMessages(prev => [
          ...prev, 
          { role: 'user', content: input },
          { role: 'assistant', content: 'Before we continue, could you please provide your email address so we can better assist you?' }
        ]);
        setInput('');
        return;
      }
    }
    
    // Add user message to chat
    const userMessage = input;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setLoading(true);

    try {
      // Send the message to the backend
      const response = await axios.post('/api/ask', {
        message: userMessage,
        userEmail: email
      });
      
      // Add the assistant response to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.data.text,
        type: response.data.type,
        data: response.data.data
      }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again later.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Format message content based on message type
  const formatMessage = (message) => {
    if (message.role === 'user' || !message.type || message.type === 'text') {
      return <p>{message.content}</p>;
    }
    
    // Format offer messages
    if (message.type === 'offer') {
      return (
        <div className="offer-message">
          <p>{message.content}</p>
          <button className="action-button">Accept Quote</button>
        </div>
      );
    }
    
    // Format appointment messages
    if (message.type === 'appointment') {
      return (
        <div className="appointment-message">
          <p>{message.content}</p>
          <button className="action-button">Add to Calendar</button>
        </div>
      );
    }
    
    return <p>{message.content}</p>;
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
                {formatMessage(message)}
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
              placeholder={isEmailSet ? "Type your message..." : "Please enter your email..."}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default Chatbot; 