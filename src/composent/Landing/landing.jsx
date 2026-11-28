import { useState } from 'react';
import Navbar from './Navbar';
import Hero from './Hero';
import About from './About';
import Team from './Team';
import Contact from './Contact';
import Footer from './Footer';
import Preloader from './Preloader.jsx';

export default function Landing() {
  const [loading, setLoading] = useState(true);
  return <div data-fabric-landing>
    {loading && <Preloader onComplete={() => setLoading(false)} />}
    <Navbar />
    <main><Hero /><About /><Team /><Contact /></main>
    <Footer />
  </div>;
}
