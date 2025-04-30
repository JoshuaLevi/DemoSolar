import React from 'react';
import '../styles/HomePage.css';

function HomePage() {
  // Function to open chatbot without starting intake process
  const handleConsultationClick = () => {
    // Open the chatbot if it's not already open
    const chatbotButton = document.querySelector('.chat-button');
    if (chatbotButton) {
      // If chatbot is closed, click it to open
      if (!chatbotButton.classList.contains('open')) {
        chatbotButton.click();
      }
      // We no longer automatically send a message
    }
  };

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-content">
          <h1>Power Your Home with Clean Solar Energy</h1>
          <p>Save money and the planet with our cutting-edge solar panel solutions</p>
          <button className="cta-button" onClick={handleConsultationClick}>Plan a Free Consultation</button>
        </div>
      </section>

      <section className="benefits">
        <h2>Why Choose DemoSolar?</h2>
        <div className="benefits-grid">
          <div className="benefit-card">
            <div className="icon">💰</div>
            <h3>Save Money</h3>
            <p>Reduce your electricity bills by up to 70% with our high-efficiency solar panels</p>
          </div>
          <div className="benefit-card">
            <div className="icon">🌱</div>
            <h3>Eco-Friendly</h3>
            <p>Reduce your carbon footprint and contribute to a cleaner, greener planet</p>
          </div>
          <div className="benefit-card">
            <div className="icon">⚡</div>
            <h3>Energy Independence</h3>
            <p>Generate your own electricity and reduce dependence on the grid</p>
          </div>
          <div className="benefit-card">
            <div className="icon">📈</div>
            <h3>Increase Home Value</h3>
            <p>Solar installations can increase your property value by up to 4%</p>
          </div>
        </div>
      </section>

      <section className="services">
        <h2>Our Services</h2>
        <div className="services-grid">
          <div className="service-card">
            <h3>Residential Solar</h3>
            <p>Custom solar solutions designed for your home's specific energy needs</p>
          </div>
          <div className="service-card">
            <h3>Commercial Solar</h3>
            <p>Scalable solar installations for businesses looking to reduce operating costs</p>
          </div>
          <div className="service-card">
            <h3>Battery Storage</h3>
            <p>Store excess solar energy for use during evenings or power outages</p>
          </div>
        </div>
      </section>

      <section className="testimonials">
        <h2>What Our Customers Say</h2>
        <div className="testimonial-card">
          <p>"Since installing solar panels with DemoSolar, my electricity bill has dropped by 65%. Their team was professional and the installation was quick and hassle-free."</p>
          <div className="testimonial-author">- Sarah Johnson, Homeowner</div>
        </div>
      </section>
    </div>
  );
}

export default HomePage; 