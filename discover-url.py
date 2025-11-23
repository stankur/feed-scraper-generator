import asyncio
import sys
import os
import json
from browser_use import Agent, Browser, ChatAnthropic
from dotenv import load_dotenv

load_dotenv()

async def discover_urls(company: str):
    llm = ChatAnthropic(model="claude-sonnet-4-0", temperature=0)
    
    browser = Browser(
        headless=False,
        keep_alive=True,
    )
    
    task = f"""
I want to find the blog URLs that contain content for engineers to learn from and would find useful, not news releases, product news, investment announcements. Right now I want to do this for {company}.

Notice that it might be easier to find the blog of this company, but I need more specific. Often there are multiple URLs in the blog feed for different categories. I want that level of granularity - the most tagged, categorized, drilled down URLs with the highest density of content for engineers to learn from, not only promotion.

IMPORTANT RULES:
1. If there are multiple category URLs (like "all posts", "AI", "research", "releases", "company"), investigate which ones contain engineering-focused content
2. PREFER specific categories over generic "all posts" - if "research" and "AI" have engineering content, output those specific URLs, NOT the "all posts" URL
3. Look for categories like: engineering, technical, architecture, infrastructure, backend, systems, research (if technical), developer
4. Avoid categories like: releases, announcements, news, company news, product updates, marketing
5. If the blog is clearly all promotional content or aimed at non-technical customers only (not for technical/founder audience), return empty array


It would be best to simply try to google <company name> engineering blogs first as a starting point, because their engineering blog might not even be in the same domain as the company.

Your final output should be a JSON object like this:
{{
  "company": "{company}",
  "urls": [
    "https://specific-engineering-category-url",
    "https://another-technical-category-url"
  ]
}}

Or if no suitable engineering content exists:
{{
  "company": "{company}",
  "urls": []
}}

Use the done action with this JSON once you've investigated.
"""
    
    print(f"🔍 Discovering engineering blog URLs for {company}...\n")
    
    agent = Agent(
        task=task,
        llm=llm,
        browser=browser,
        save_conversation_path=f"logs/{company.lower().replace(' ', '_')}_conversation.json",
    )
    
    history = await agent.run(max_steps=30)
    
    print("\n" + "="*60)
    print("📊 RESULTS")
    print("="*60)
    
    print(f"\n✅ Completed in {history.number_of_steps()} steps")
    print(f"⏱️  Duration: {history.total_duration_seconds():.1f}s")
    
    if history.is_done():
        result = history.final_result()
        
        try:
            if isinstance(result, str):
                parsed = json.loads(result)
            else:
                parsed = result
            
            urls = parsed.get('urls', [])
            if urls:
                print(f"\n🎯 Found {len(urls)} URL(s) for {parsed.get('company', company)}:")
                for url in urls:
                    print(f"  • {url}")
            else:
                print(f"\n⚠️  No suitable engineering blog found for {parsed.get('company', company)}")
                print(f"  (Content is likely too promotional or not technical)")
            
            output_file = f"{company.lower().replace(' ', '_')}_urls.json"
            with open(output_file, 'w') as f:
                json.dump(parsed, f, indent=2)
            print(f"\n💾 Saved to: {output_file}")
            
        except (json.JSONDecodeError, TypeError) as e:
            print(f"\n⚠️  Could not parse JSON, raw result:")
            print(result)
        
        print(f"\n📍 Visited URLs:")
        for i, url in enumerate(history.urls(), 1):
            print(f"  {i}. {url}")
        
        print(f"\n🔧 Actions taken:")
        for i, action in enumerate(history.action_names(), 1):
            print(f"  {i}. {action}")
        
    else:
        print("\n❌ Agent did not complete successfully")
    
    if history.has_errors():
        print(f"\n⚠️  Errors:")
        for error in history.errors():
            if error:
                print(f"  - {error}")
    
    print("\n" + "="*60)
    print(f"💾 Full conversation: logs/{company.lower().replace(' ', '_')}_conversation.json")
    print("="*60)
    
    input("\n👀 Browser still open. Press Enter to close...")
    
    return history

async def main():
    if len(sys.argv) < 2:
        print("Usage: python discover-url.py <company_name>")
        print("Example: python discover-url.py Temporal")
        sys.exit(1)
    
    company = sys.argv[1]
    os.makedirs("logs", exist_ok=True)
    await discover_urls(company)

if __name__ == "__main__":
    asyncio.run(main())

