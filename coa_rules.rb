# Which flag and which name a country has at the 1836 start. The game picks both by running triggers
# ("a monarchy whose primary culture is Manchu is the Great Qing"; "an absolute monarchy flies the
# imperial flag"), so this runs the same triggers against what we know of a country at the start:
# its tag, its laws and its cultures. Anything it can't judge (a variable, a ruler's ideology, a
# government type that only exists later) counts as "not true", which for 1836 is the right way.
require_relative "vic3_script"

class CoaRules
  # Pacts that make one country the subject of another (the rest, such as a shared market, don't).
  SUBJECT_PACTS = %w[colony dominion personal_union protectorate puppet chartered_company tributary vassal].freeze

  Facts = Struct.new(:tag, :laws, :cultures, :scope, keyword_init: true)

  # Facts of every existing country by tag: set by the caller, for rules that look at an overlord.
  attr_writer :all_facts

  def initialize(game, existing_tags)
    @existing = existing_tags
    @triggers = {}
    Dir[game.join("common/scripted_triggers/*.txt").to_s].sort.each do |f|
      Vic3Script.parse(File.read(f)).each { |k, _, v| @triggers[k] = v if k && v.is_a?(Array) }
    end
    @lists = {}
    Dir[game.join("common/flag_definitions/*.txt").to_s].sort.each do |f|
      Vic3Script.parse(File.read(f)).each { |k, _, v| @lists[k] = v if k && v.is_a?(Array) && !k.start_with?("@") }
    end
    @pacts = start_pacts(game)
    @names = Hash.new { |h, k| h[k] = [] }
    Dir[game.join("common/dynamic_country_names/*.txt").to_s].sort.each do |f|
      Vic3Script.parse(File.read(f)).each do |tag, _, body|
        next unless tag && body.is_a?(Array)

        Vic3Script.values(body, "dynamic_country_name").each { |d| @names[tag] << d if d.is_a?(Array) }
      end
    end
  end

  # The coat-of-arms key this country flies: the valid flag definition with the highest priority.
  def flag_coa(facts, known)
    best = nil
    definitions(facts.tag).each do |d|
      coa = Vic3Script.value(d, "coa")
      next unless coa.is_a?(String) && coa != "list" && known.include?(coa)

      trigger = Vic3Script.value(d, "trigger")
      next unless trigger.nil? || holds?(trigger, facts) == true

      priority = Vic3Script.value(d, "priority").to_f
      best = [priority, coa] if best.nil? || priority > best.first
    end
    best ? best.last : facts.tag
  end

  # [name key, adjective key] of the dynamic name that applies, or nil: the plain name stays.
  def dynamic_name(facts)
    best = nil
    @names[facts.tag].each do |d|
      trigger = Vic3Script.value(d, "trigger")
      next unless trigger.nil? || holds?(trigger, facts) == true

      priority = Vic3Script.value(d, "priority").to_f
      best = [priority, Vic3Script.value(d, "name"), Vic3Script.value(d, "adjective"), Vic3Script.value(d, "use_overlord_prefix") == "yes"] if best.nil? || priority > best.first
    end
    best && best[1] ? [ best[1], best[2], best[3] && direct_overlord(facts.tag) ] : nil
  end

  # The country that holds this one as a subject at the start, if any.
  def direct_overlord(tag) = @pacts.find { |_, sub, t| sub == tag && SUBJECT_PACTS.include?(t) }&.first

  # True when a dynamic name's trigger can't be judged from what we know (so the plain name may be wrong).
  def dynamic_name_unsure?(facts)
    @names[facts.tag].any? do |d|
      trigger = Vic3Script.value(d, "trigger")
      trigger && holds?(trigger, facts).nil?
    end
  end

  private

  # [overlord, subject, type] for every subject relationship the game sets up at the start.
  def start_pacts(game)
    pacts = []
    walk = lambda do |block, owner|
      block.each do |k, _, v|
        next unless v.is_a?(Array)

        if k =~ /\Ac:(\w+)\z/
          walk.call(v, $1)
        elsif k == "create_diplomatic_pact" && owner
          pacts << [ owner, Vic3Script.value(v, "country").to_s.delete_prefix("c:"), Vic3Script.value(v, "type") ]
        else
          walk.call(v, owner)
        end
      end
    end
    Dir[game.join("common/history/diplomacy/00_subject_relationships.txt").to_s].each { |f| walk.call(Vic3Script.parse(File.read(f)), nil) }
    pacts
  end

  # The tag a scope reference points at: c:GBR, scope:actor or this.
  def tag_of(ref, facts)
    case ref.to_s
    when /\Ac:(\w+)\z/ then $1
    when "scope:actor", "this" then facts.tag
    end
  end

  # Does any country above this one in the chain of overlords satisfy the block?
  def any_overlord?(block, facts)
    return nil unless @all_facts

    seen = []
    tag = facts.tag
    while (over = direct_overlord(tag)) && !seen.include?(over)
      seen << over
      tag = over
      f = @all_facts[over] or return nil
      return true if holds?(block, f) == true
    end
    false
  end

  def pact?(block, facts)
    me = facts.scope || facts.tag
    other = tag_of(Vic3Script.value(block, "who"), facts)
    type = Vic3Script.value(block, "type")
    return nil unless other && type

    initiator = Vic3Script.value(block, "is_initiator")
    @pacts.any? do |over, sub, t|
      t == type && (initiator == "yes" ? (over == me && sub == other) : initiator == "no" ? (over == other && sub == me) : (over == me && sub == other || over == other && sub == me))
    end
  end

  # The flag definitions of a tag's own list (and any lists it includes) and of DEFAULT.
  def definitions(tag, seen = [])
    out = []
    [ tag, "DEFAULT" ].each do |name|
      list = @lists[name]
      next if list.nil? || seen.include?(name)

      Vic3Script.values(list, "includes").each { |inc| out.concat(definitions(inc, seen + [ name ])) if inc.is_a?(String) }
      out.concat(Vic3Script.values(list, "flag_definition").select { |d| d.is_a?(Array) })
    end
    out
  end

  # true / false / nil (can't tell). A block is an AND of its entries.
  def holds?(block, facts)
    results = block.reject { |k, _, _| k.nil? }.map { |k, op, v| entry(k, op, v, facts) }
    return false if results.include?(false)

    results.include?(nil) ? nil : true
  end

  def any?(block, facts)
    results = block.reject { |k, _, _| k.nil? }.map { |k, op, v| entry(k, op, v, facts) }
    return true if results.include?(true)

    results.include?(nil) ? nil : false
  end

  def entry(key, _op, value, facts)
    case key
    when "OR" then any?(value, facts)
    when "AND" then holds?(value, facts)
    when "NOT", "NOR" then (r = any?(value, facts)).nil? ? nil : !r
    when "always" then value == "yes"
    when "has_law", "has_law_or_variant" then facts.laws.include?(value.to_s.delete_prefix("law_type:"))
    when "country_has_primary_culture" then facts.cultures.include?(value.to_s.delete_prefix("cu:"))
    when "exists" then value == "scope:actor" ? true : (value.to_s.start_with?("c:") ? @existing.include?(value.delete_prefix("c:")) : nil)
    when "scope:actor" then value.is_a?(Array) ? holds?(value, facts.dup.tap { |f| f.scope = nil }) : nil
    when "is_secessionist", "is_revolutionary", "is_revolutionary_or_secessionist", "has_variable" then value == "no"
    when "is_subject_type" then @pacts.any? { |_, sub, t| sub == facts.tag && t == value.to_s.delete_prefix("subject_type_") }
    when "is_subject" then direct_overlord(facts.tag).nil? == (value == "no")
    when "is_subject_of", "is_direct_subject_of"
      (over = tag_of(value, facts)) ? @pacts.any? { |o, sub, t| o == over && sub == facts.tag && SUBJECT_PACTS.include?(t) } : nil
    when "any_overlord_or_above" then value.is_a?(Array) ? any_overlord?(value, facts) : nil
    when "has_government_type" then value == "gov_chartered_company" ? @pacts.any? { |_, sub, t| sub == facts.tag && t == "chartered_company" } : nil
    when "owns_entire_state_region" then false # nobody holds a whole region of someone else's at the start
    when "has_diplomatic_pact" then value.is_a?(Array) ? pact?(value, facts) : nil
    when /\Ac:(\w+)\z/
      if value == "this" then facts.tag == $1
      elsif value.is_a?(Array) then holds?(value, facts.dup.tap { |f| f.scope = $1 })
      end
    else
      if @triggers.key?(key) && %w[yes no].include?(value)
        r = holds?(@triggers[key], facts)
        r.nil? || value == "yes" ? r : !r
      end
    end
  end
end
