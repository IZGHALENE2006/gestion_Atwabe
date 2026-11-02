import React, { useState } from 'react';
import Navbar from './Navbar';
import Hero from './Hero';
import About from './About';
import Team from './Team';
import Contact from './Contact';
import Footer from './Footer';
import Preloader from './Preloader.jsx'; // Import the new component

export default function Landing() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="relative">
      {/* 1. Preloader Overlay */}
      {loading && <Preloader onComplete={() => setLoading(false)} />}

      {/* 2. Main Site Content */}
      {/* We keep the opacity 0 initially so there's no "flash" of content behind the loader */}
      {/* <div className={`transition-opacity duration-1000 ${loading ? 'opacity-0' : 'opacity-100'}`}> */}
        <Navbar />
        <Hero />
        <About />
        <Team />
        <Contact />
        <Footer />
      </div>
    // </div>
  );
}